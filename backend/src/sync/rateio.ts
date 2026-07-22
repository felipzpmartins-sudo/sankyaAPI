import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { executeQuery } from "../sankhya/query.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

export async function syncRateio(): Promise<void> {
  try {
    // TGFRAT guarda a distribuição. CODEMP identifica a empresa de origem em
    // TGFFIN; cada empresa de destino é representada pelo CODPROJ da parcela.
    const candidates = ["TGFRAT", "Rateio", "RateioProjeto"];
    let rows: any[] = [];
    let sourceReached = false;
    const failures: string[] = [];

    try {
      const pageSize = 5_000;
      for (let offset = 0; ; offset += pageSize) {
        const result = await executeQuery(`
          SELECT NUFIN, CODPROJ, PERCRATEIO, CODEMP
          FROM (
            SELECT RAT.NUFIN,
                   RAT.CODPROJ,
                   RAT.PERCRATEIO,
                   FIN.CODEMP,
                   ROW_NUMBER() OVER (ORDER BY RAT.NUFIN, RAT.CODPROJ) AS RN
            FROM TGFRAT RAT
            INNER JOIN TGFFIN FIN ON FIN.NUFIN = RAT.NUFIN
            WHERE FIN.DTNEG >= TO_DATE('01/01/2025', 'DD/MM/YYYY')
              AND FIN.RECDESP = -1
          )
          WHERE RN > ${offset} AND RN <= ${offset + pageSize}
          ORDER BY RN
        `);
        const page = result.rows.map((row) => ({
          NUFIN: row[0],
          CODPROJ: row[1],
          PERCRATEIO: row[2],
          CODEMP: row[3],
        }));
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      sourceReached = true;
    } catch (error) {
      failures.push(`DbExplorerSP: ${error instanceof Error ? error.message : String(error)}`);
    }

    for (const rootEntity of rows.length > 0 ? [] : candidates) {
      try {
        rows = await loadAllRecords({
          rootEntity,
          fields: ["NUFIN", "CODPROJ", "PERCRATEIO"],
        });
        sourceReached = true;
        if (rows.length > 0) break;
      } catch (error) {
        failures.push(`${rootEntity}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (!sourceReached) {
      throw new Error(`Não foi possível consultar o rateio no Sankhya. ${failures.join(" | ")}`);
    }

    const db = getDb();
    const now = new Date().toISOString();
    const tituloEmpresa = db.prepare("SELECT CODEMP, RECDESP FROM titulos WHERE NUFIN = ?");
    const upsert = db.prepare(
      `INSERT OR REPLACE INTO titulos_rateio (NUFIN, CODPROJ, PERCRATEIO, CODEMP, synced_at)
       VALUES (@NUFIN, @CODPROJ, @PERCRATEIO, @CODEMP, @synced_at)`,
    );

    const consolidados = new Map<string, {
      NUFIN: number;
      CODPROJ: number | null;
      PERCRATEIO: number;
      CODEMP: number;
      synced_at: string;
    }>();
    for (const row of rows) {
      const nufin = Number(row.NUFIN);
      const codprojInformado = row.CODPROJ == null || row.CODPROJ === ""
        ? null
        : Number(row.CODPROJ);
      if (
        !Number.isFinite(nufin) ||
        (codprojInformado != null && !Number.isFinite(codprojInformado))
      ) {
        continue;
      }
      const codproj = codprojInformado;
      const titulo = tituloEmpresa.get(nufin) as { CODEMP: number; RECDESP: number } | undefined;
      if (!titulo || Number(titulo.RECDESP) !== -1) continue;

      const percentualInformado = Number(row.PERCRATEIO);
      const percentual = Number.isFinite(percentualInformado) ? percentualInformado : 0;
      const empresaInformada = row.CODEMP == null ? Number.NaN : Number(row.CODEMP);
      const codemp = Number.isFinite(empresaInformada) && empresaInformada > 0
        ? empresaInformada
        : titulo.CODEMP;
      const chave = `${nufin}:${codproj ?? "SEM_PROJETO"}`;
      const existente = consolidados.get(chave);
      if (existente) {
        existente.PERCRATEIO += percentual;
      } else {
        consolidados.set(chave, {
          NUFIN: nufin,
          CODPROJ: codproj,
          PERCRATEIO: percentual,
          CODEMP: codemp,
          synced_at: now,
        });
      }
    }

    let inserted = 0;
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM titulos_rateio").run();
      for (const rateio of consolidados.values()) {
        upsert.run(rateio);
        inserted += 1;
      }
    });
    tx();

    recordSyncSuccess({ entity: "rateio", rowCount: inserted, fullSync: true });
  } catch (error) {
    recordSyncError("rateio", error);
    throw error;
  }
}
