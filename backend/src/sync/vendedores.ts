import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const FIELDS = ["CODVEND", "APELIDO", "ATIVO"];

export async function syncVendedores(): Promise<void> {
  try {
    const rows = await loadAllRecords({
      rootEntity: "Vendedor",
      fields: FIELDS,
    });

    const db = getDb();
    const now = new Date().toISOString();

    const upsert = db.prepare(
      `INSERT INTO vendedores (CODVEND, APELIDO, ativo, synced_at)
       VALUES (@CODVEND, @APELIDO, @ativo, @synced_at)
       ON CONFLICT(CODVEND) DO UPDATE SET
         APELIDO   = excluded.APELIDO,
         ativo     = excluded.ativo,
         synced_at = excluded.synced_at`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const r of rows) {
        const codvend = Number(r.CODVEND);
        if (!Number.isFinite(codvend)) continue;
        upsert.run({
          CODVEND: codvend,
          APELIDO: String(r.APELIDO ?? ""),
          ativo: r.ATIVO === "S" ? 1 : 0,
          synced_at: now,
        });
        inserted += 1;
      }
    });
    tx();

    recordSyncSuccess({ entity: "vendedores", rowCount: inserted, fullSync: true });
  } catch (err) {
    recordSyncError("vendedores", err);
    throw err;
  }
}
