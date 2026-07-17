import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const FIELDS = ["CODCENCUS", "DESCRCENCUS", "ATIVO"];
const REQUIRED_FIELDS = ["CODCENCUS", "DESCRCENCUS"];

async function loadCentrosResultado() {
  try {
    return await loadAllRecords({ rootEntity: "CentroResultado", fields: FIELDS });
  } catch {
    return loadAllRecords({ rootEntity: "TSICUS", fields: REQUIRED_FIELDS });
  }
}

export async function syncCentrosResultado(): Promise<void> {
  try {
    const rows = await loadCentrosResultado();

    const db = getDb();
    const now = new Date().toISOString();

    const upsert = db.prepare(
      `INSERT INTO centros_resultado (CODCENCUS, DESCRCENCUS, ativo, synced_at)
       VALUES (@CODCENCUS, @DESCRCENCUS, @ativo, @synced_at)
       ON CONFLICT(CODCENCUS) DO UPDATE SET
         DESCRCENCUS = excluded.DESCRCENCUS,
         ativo       = excluded.ativo,
         synced_at   = excluded.synced_at`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const row of rows) {
        const codcencus = Number(row.CODCENCUS);
        if (!Number.isFinite(codcencus)) continue;

        upsert.run({
          CODCENCUS: codcencus,
          DESCRCENCUS: String(row.DESCRCENCUS ?? ""),
          ativo: row.ATIVO != null ? (row.ATIVO === "S" || row.ATIVO === "1" ? 1 : Number(row.ATIVO) || 0) : 1,
          synced_at: now,
        });
        inserted += 1;
      }
    });
    tx();

    recordSyncSuccess({ entity: "centros_resultado", rowCount: inserted, fullSync: true });
  } catch (err) {
    recordSyncError("centros_resultado", err);
    throw err;
  }
}
