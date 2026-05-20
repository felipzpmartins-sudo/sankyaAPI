import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

/**
 * Tipos de título (TGFTTI): DINHEIRO, CHEQUE, BOLETO, A VISTA, etc.
 * Usado na tela 14.2 para distribuição do fluxo de caixa por forma de pagamento.
 *
 * Nota: o schema atual da tabela `tipos_titulo` só tem CODTIPTIT e DESCRTIPTIT
 * (sem coluna ATIVO). O Sankhya retorna ATIVO mas só guardamos o que importa.
 */
const FIELDS = ["CODTIPTIT", "DESCRTIPTIT", "ATIVO"];

export async function syncTiposTitulo(): Promise<void> {
  try {
    const rows = await loadAllRecords({
      rootEntity: "TipoTitulo",
      fields: FIELDS,
      expression: "this.ATIVO = 'S'",
    });

    const db = getDb();
    const now = new Date().toISOString();

    const upsert = db.prepare(
      `INSERT INTO tipos_titulo (CODTIPTIT, DESCRTIPTIT, synced_at)
       VALUES (@CODTIPTIT, @DESCRTIPTIT, @synced_at)
       ON CONFLICT(CODTIPTIT) DO UPDATE SET
         DESCRTIPTIT = excluded.DESCRTIPTIT,
         synced_at   = excluded.synced_at`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const r of rows) {
        const codtiptit = Number(r.CODTIPTIT);
        if (!Number.isFinite(codtiptit)) continue;
        upsert.run({
          CODTIPTIT: codtiptit,
          DESCRTIPTIT: String(r.DESCRTIPTIT ?? ""),
          synced_at: now,
        });
        inserted += 1;
      }
    });
    tx();

    recordSyncSuccess({
      entity: "tipos_titulo",
      rowCount: inserted,
      fullSync: true,
    });
  } catch (err) {
    recordSyncError("tipos_titulo", err);
    throw err;
  }
}
