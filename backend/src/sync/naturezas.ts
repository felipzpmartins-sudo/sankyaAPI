import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

/**
 * Plano de contas (TGFNAT). Sem campo ATIVO no Maker — pegamos tudo.
 * Estrutura hierárquica via prefixo do CODNAT (ex.: '1010400' = receita,
 * '3070100' = despesa financeira). A categorização gerencial fica numa
 * tabela auxiliar `natureza_categoria` a ser populada manualmente.
 */
const FIELDS = ["CODNAT", "DESCRNAT"];

export async function syncNaturezas(): Promise<void> {
  try {
    const rows = await loadAllRecords({
      rootEntity: "Natureza",
      fields: FIELDS,
    });

    const db = getDb();
    const now = new Date().toISOString();

    const upsert = db.prepare(
      `INSERT INTO naturezas (CODNAT, DESCRNAT, synced_at)
       VALUES (@CODNAT, @DESCRNAT, @synced_at)
       ON CONFLICT(CODNAT) DO UPDATE SET
         DESCRNAT  = excluded.DESCRNAT,
         synced_at = excluded.synced_at`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const r of rows) {
        const codnat = Number(r.CODNAT);
        if (!Number.isFinite(codnat)) continue;
        upsert.run({
          CODNAT: codnat,
          DESCRNAT: String(r.DESCRNAT ?? ""),
          synced_at: now,
        });
        inserted += 1;
      }
    });
    tx();

    recordSyncSuccess({ entity: "naturezas", rowCount: inserted, fullSync: true });
  } catch (err) {
    recordSyncError("naturezas", err);
    throw err;
  }
}
