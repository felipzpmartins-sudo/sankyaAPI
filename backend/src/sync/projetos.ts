import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const FIELD_VARIANTS = [
  ["CODPROJ", "IDENTIFICACAO", "DESCRPROJ", "ATIVO", "CODPROJPAI", "GRAU", "ANALITICO"],
  ["CODPROJ", "IDENTIFICACAO", "ATIVO", "CODPROJPAI", "GRAU", "ANALITICO"],
  ["CODPROJ", "IDENTIFICACAO", "ATIVO"],
  ["CODPROJ", "IDENTIFICACAO"],
  ["CODPROJ"],
];

async function loadProjetos(): Promise<any[]> {
  const candidates = ["Projeto", "TCSPRJ"];
  const failures: string[] = [];
  let sourceReached = false;

  for (const rootEntity of candidates) {
    for (const fields of FIELD_VARIANTS) {
      try {
        const rows = await loadAllRecords({ rootEntity, fields });
        sourceReached = true;
        if (rows.length > 0) return rows;
      } catch (error) {
        failures.push(`${rootEntity}[${fields.join(",")}]: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (!sourceReached) {
    throw new Error(`Não foi possível consultar TCSPRJ no Sankhya. ${failures.join(" | ")}`);
  }
  return [];
}

export async function syncProjetos(): Promise<void> {
  try {
    const rows = await loadProjetos();
    const db = getDb();
    const now = new Date().toISOString();
    const upsert = db.prepare(
      `INSERT INTO projetos (CODPROJ, CODPROJPAI, GRAU, ANALITICO, IDENTIFICACAO, DESCRPROJ, ativo, synced_at)
       VALUES (@CODPROJ, @CODPROJPAI, @GRAU, @ANALITICO, @IDENTIFICACAO, @DESCRPROJ, @ativo, @synced_at)
       ON CONFLICT(CODPROJ) DO UPDATE SET
         CODPROJPAI = excluded.CODPROJPAI,
         GRAU = excluded.GRAU,
         ANALITICO = excluded.ANALITICO,
         IDENTIFICACAO = excluded.IDENTIFICACAO,
         DESCRPROJ = excluded.DESCRPROJ,
         ativo = excluded.ativo,
         synced_at = excluded.synced_at`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const row of rows) {
        const codproj = Number(row.CODPROJ);
        if (!Number.isFinite(codproj)) continue;
        upsert.run({
          CODPROJ: codproj,
          CODPROJPAI: row.CODPROJPAI != null ? Number(row.CODPROJPAI) : null,
          GRAU: row.GRAU != null ? Number(row.GRAU) : null,
          ANALITICO: row.ANALITICO ?? null,
          IDENTIFICACAO: String(row.IDENTIFICACAO ?? ""),
          DESCRPROJ: String(row.DESCRPROJ ?? row.IDENTIFICACAO ?? `Projeto ${codproj}`),
          ativo: row.ATIVO != null ? (row.ATIVO === "S" || row.ATIVO === "1" ? 1 : Number(row.ATIVO) || 0) : 1,
          synced_at: now,
        });
        inserted += 1;
      }
    });
    tx();

    recordSyncSuccess({ entity: "projetos", rowCount: inserted, fullSync: true });
  } catch (error) {
    recordSyncError("projetos", error);
    throw error;
  }
}
