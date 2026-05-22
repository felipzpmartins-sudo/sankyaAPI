import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { parseDecimal, parseIntOrNull } from "../utils/numbers.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const FIELDS_MARKET = ["CODPROD", "CODLOCAL", "ESTOQUE", "ESTMIN", "ESTMAX"];

function normalizeStockValue(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseDecimal(String(value));
}

function parseLocation(value: string | number | null | undefined): number {
  const parsed = parseIntOrNull(value == null ? null : String(value));
  return parsed ?? 0;
}

function sankhyaValue(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
}

async function loadStockFromEstoque(): Promise<unknown[]> {
  return await loadAllRecords({
    rootEntity: "Estoque",
    fields: FIELDS_MARKET,
  });
}

async function loadStockFromTgfest(): Promise<unknown[]> {
  return await loadAllRecords({
    rootEntity: "TGFEST",
    fields: FIELDS_MARKET,
  });
}

export async function syncEstoque(): Promise<void> {
  try {
    let records: unknown[];
    try {
      records = await loadStockFromEstoque();
    } catch (err) {
      console.warn("syncEstoque: Estoque não disponível em 'Estoque', tentando TGFEST", err);
      records = await loadStockFromTgfest();
    }

    const db = getDb();
    const now = new Date().toISOString();

    const deleteAll = db.prepare("DELETE FROM produto_estoque");
    deleteAll.run();

    const upsert = db.prepare(
      `INSERT INTO produto_estoque
         (CODPROD, CODLOCALORIG, ESTOQUE, EST_MINIMO, EST_MAXIMO, UNIDADE, synced_at)
       VALUES
         (@CODPROD, @CODLOCALORIG, @ESTOQUE, @EST_MINIMO, @EST_MAXIMO, @UNIDADE, @synced_at)
       ON CONFLICT(CODPROD, CODLOCALORIG) DO UPDATE SET
         ESTOQUE     = excluded.ESTOQUE,
         EST_MINIMO  = excluded.EST_MINIMO,
         EST_MAXIMO  = excluded.EST_MAXIMO,
         UNIDADE     = excluded.UNIDADE,
         synced_at   = excluded.synced_at`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const row of records) {
        const record = row as Record<string, unknown>;
        const codprod = parseIntOrNull(sankhyaValue(record.CODPROD)?.toString() ?? null);
        if (codprod == null) continue;

        const codLocalOrig = parseLocation(sankhyaValue(record.CODLOCAL));
        const estoque = normalizeStockValue(sankhyaValue(record.ESTOQUE));
        const estMin = normalizeStockValue(sankhyaValue(record.ESTMIN));
        const estMax = normalizeStockValue(sankhyaValue(record.ESTMAX));

        upsert.run({
          CODPROD: codprod,
          CODLOCALORIG: codLocalOrig,
          ESTOQUE: estoque,
          EST_MINIMO: estMin,
          EST_MAXIMO: estMax,
          UNIDADE: null,
          synced_at: now,
        });
        inserted += 1;
      }
    });
    tx();

    recordSyncSuccess({ entity: "estoque", rowCount: inserted, fullSync: true });
  } catch (err) {
    recordSyncError("estoque", err);
    throw err;
  }
}
