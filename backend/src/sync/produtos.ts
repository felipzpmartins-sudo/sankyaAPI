import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { parseDecimal, parseIntOrNull } from "../utils/numbers.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const FIELDS_CORE = [
  "CODPROD",
  "DESCRPROD",
  "REFERENCIA",
  "CODGRUPOPROD",
  "GRUPODESCPROD",
  "UNIDADE",
  "ATIVO",
];

const FIELDS_WITH_STOCK = ["ESTOQUE", "ESTMIN", "ESTMAX"];

function parseAtivo(value: string | null | undefined): 0 | 1 {
  if (value == null) return 0;
  const text = String(value).trim().toUpperCase();
  if (text === "S" || text === "1") return 1;
  return 0;
}

function normalizeStockValue(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseDecimal(String(value));
}

async function loadProducts(): Promise<unknown[]> {
  return await loadAllRecords({
    rootEntity: "Produto",
    fields: FIELDS_CORE,
  });
}

export async function syncProdutos(): Promise<void> {
  try {
    const records = await loadProducts();
    const db = getDb();
    const now = new Date().toISOString();

    const upsert = db.prepare(
      `INSERT INTO produtos
         (CODPROD, DESCRPROD, REFERENCIA, CODGRUPOPROD, GRUPO_DESCR, UNIDADE, ativo, synced_at)
       VALUES
         (@CODPROD, @DESCRPROD, @REFERENCIA, @CODGRUPOPROD, @GRUPO_DESCR, @UNIDADE, @ativo, @synced_at)
       ON CONFLICT(CODPROD) DO UPDATE SET
         DESCRPROD     = excluded.DESCRPROD,
         REFERENCIA    = excluded.REFERENCIA,
         CODGRUPOPROD  = excluded.CODGRUPOPROD,
         GRUPO_DESCR   = excluded.GRUPO_DESCR,
         UNIDADE       = excluded.UNIDADE,
         ativo         = excluded.ativo,
         synced_at     = excluded.synced_at`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const row of records) {
        const codprod = parseIntOrNull((row as Record<string, unknown>).CODPROD);
        if (codprod == null) continue;

        upsert.run({
          CODPROD: codprod,
          DESCRPROD: String((row as Record<string, unknown>).DESCRPROD ?? ""),
          REFERENCIA: (row as Record<string, unknown>).REFERENCIA ?? null,
          CODGRUPOPROD: parseIntOrNull((row as Record<string, unknown>).CODGRUPOPROD),
          GRUPO_DESCR: (row as Record<string, unknown>).GRUPODESCPROD ?? null,
          UNIDADE: (row as Record<string, unknown>).UNIDADE ?? null,
          ativo: parseAtivo((row as Record<string, unknown>).ATIVO),
          synced_at: now,
        });
        inserted += 1;
      }
    });
    tx();

    recordSyncSuccess({ entity: "produtos", rowCount: inserted, fullSync: true });
  } catch (err) {
    recordSyncError("produtos", err);
    throw err;
  }
}
