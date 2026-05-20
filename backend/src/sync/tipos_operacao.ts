import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const FIELDS = ["CODTIPOPER", "DESCROPER", "TIPMOV", "ATIVO"];

export async function syncTiposOperacao(): Promise<void> {
  try {
    const rows = await loadAllRecords({
      rootEntity: "TipoOperacao",
      fields: FIELDS,
      expression: "this.ATIVO = 'S'",
    });

    const db = getDb();
    const now = new Date().toISOString();

    const upsert = db.prepare(
      `INSERT INTO tipos_operacao (CODTIPOPER, DESCROPER, TIPMOV, ATIVO, synced_at)
       VALUES (@CODTIPOPER, @DESCROPER, @TIPMOV, @ATIVO, @synced_at)
       ON CONFLICT(CODTIPOPER) DO UPDATE SET
         DESCROPER = excluded.DESCROPER,
         TIPMOV    = excluded.TIPMOV,
         ATIVO     = excluded.ATIVO,
         synced_at = excluded.synced_at`,
    );

    const tx = db.transaction(() => {
      for (const r of rows) {
        const codtipoper = Number(r.CODTIPOPER);
        if (!Number.isFinite(codtipoper)) continue;
        upsert.run({
          CODTIPOPER: codtipoper,
          DESCROPER: String(r.DESCROPER ?? ""),
          TIPMOV: String(r.TIPMOV ?? ""),
          ATIVO: r.ATIVO === "S" ? 1 : 0,
          synced_at: now,
        });
      }
    });
    tx();

    recordSyncSuccess({
      entity: "tipos_operacao",
      rowCount: rows.length,
      fullSync: true,
    });
  } catch (err) {
    recordSyncError("tipos_operacao", err);
    throw err;
  }
}
