import { getDb } from "../db/connection.js";

export type SyncStateRow = {
  entity: string;
  last_synced_at: string | null;
  last_full_sync_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  success_count: number;
  error_count: number;
  row_count: number;
};

export function getSyncState(entity: string): SyncStateRow | undefined {
  return getDb()
    .prepare("SELECT * FROM sync_state WHERE entity = ?")
    .get(entity) as SyncStateRow | undefined;
}

export function recordSyncSuccess(opts: {
  entity: string;
  rowCount: number;
  fullSync?: boolean;
}): void {
  const now = new Date().toISOString();
  const db = getDb();

  // `last_error` NÃO é limpo aqui de propósito: junto com `last_error_at` ele
  // mantém o diagnóstico da última falha visível mesmo depois de um ciclo bem
  // sucedido. Antes disso, entidades com milhares de erros acumulados em
  // `error_count` chegavam ao /api/health com `last_error: null` e não havia
  // como saber a causa.
  db.prepare(
    `INSERT INTO sync_state (entity, last_synced_at, last_full_sync_at, last_error, last_error_at, success_count, error_count, row_count)
     VALUES (@entity, @now, @lastFull, NULL, NULL, 1, 0, @rowCount)
     ON CONFLICT(entity) DO UPDATE SET
       last_synced_at    = @now,
       last_full_sync_at = COALESCE(@lastFull, last_full_sync_at),
       success_count     = success_count + 1,
       row_count         = @rowCount`,
  ).run({
    entity: opts.entity,
    now,
    lastFull: opts.fullSync ? now : null,
    rowCount: opts.rowCount,
  });
}

export function recordSyncError(entity: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const now = new Date().toISOString();
  const db = getDb();

  db.prepare(
    `INSERT INTO sync_state (entity, last_error, last_error_at, success_count, error_count, row_count)
     VALUES (@entity, @message, @now, 0, 1, 0)
     ON CONFLICT(entity) DO UPDATE SET
       last_error    = @message,
       last_error_at = @now,
       error_count   = error_count + 1`,
  ).run({ entity, message, now });
}
