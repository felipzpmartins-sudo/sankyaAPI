import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

export async function syncRateio(): Promise<void> {
  try {
    // Tentamos as entidades mais prováveis do Sankhya — TGFRAT é a tabela física.
    const candidates = ["TGFRAT", "Rateio", "RateioProjeto"];
    let rows = [] as any[];
    for (const ent of candidates) {
      try {
        rows = await loadAllRecords({ rootEntity: ent, fields: ["NUFIN", "CODPROJ", "PERCRATEIO", "CODEMP"] });
        if (rows.length > 0) break;
      } catch {
        // tenta próxima
      }
    }

    const db = getDb();
    const now = new Date().toISOString();

    const upsert = db.prepare(
      `INSERT OR REPLACE INTO titulos_rateio (NUFIN, CODPROJ, PERCRATEIO, CODEMP, synced_at)
       VALUES (@NUFIN, @CODPROJ, @PERCRATEIO, @CODEMP, @synced_at)`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const r of rows) {
        const nufin = Number(r.NUFIN);
        if (!Number.isFinite(nufin)) continue;
        upsert.run({
          NUFIN: nufin,
          CODPROJ: r.CODPROJ != null ? Number(r.CODPROJ) : null,
          PERCRATEIO: r.PERCRATEIO != null ? Number(r.PERCRATEIO) : 0,
          CODEMP: r.CODEMP != null ? Number(r.CODEMP) : null,
          synced_at: now,
        });
        inserted += 1;
      }
    });
    tx();

    recordSyncSuccess({ entity: "rateio", rowCount: inserted, fullSync: true });
  } catch (err) {
    recordSyncError("rateio", err);
    throw err;
  }
}
