import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const FIELDS = ["CODPROJ", "IDENTIFICACAO", "DESCRPROJ", "ATIVO"];

export async function syncProjetos(): Promise<void> {
  try {
    const rows = await loadAllRecords({ rootEntity: "Projeto", fields: FIELDS });

    const db = getDb();
    const now = new Date().toISOString();

    const upsert = db.prepare(
      `INSERT INTO projetos (CODPROJ, IDENTIFICACAO, DESCRPROJ, ativo, synced_at)
       VALUES (@CODPROJ, @IDENTIFICACAO, @DESCRPROJ, @ativo, @synced_at)
       ON CONFLICT(CODPROJ) DO UPDATE SET
         IDENTIFICACAO = excluded.IDENTIFICACAO,
         DESCRPROJ     = excluded.DESCRPROJ,
         ativo         = excluded.ativo,
         synced_at     = excluded.synced_at`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const r of rows) {
        const codproj = Number(r.CODPROJ);
        if (!Number.isFinite(codproj)) continue;
        upsert.run({
          CODPROJ: codproj,
          IDENTIFICACAO: String(r.IDENTIFICACAO ?? ""),
          DESCRPROJ: String(r.DESCRPROJ ?? ""),
          ativo: r.ATIVO != null ? (r.ATIVO === "S" || r.ATIVO === "1" ? 1 : Number(r.ATIVO) || 0) : 1,
          synced_at: now,
        });
        inserted += 1;
      }
    });
    tx();

    recordSyncSuccess({ entity: "projetos", rowCount: inserted, fullSync: true });
  } catch (err) {
    recordSyncError("projetos", err);
    throw err;
  }
}
