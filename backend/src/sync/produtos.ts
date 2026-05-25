import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { parseIntOrNull } from "../utils/numbers.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const FIELDS_CORE = [
  "CODPROD",
  "DESCRPROD",
  "REFERENCIA",
  "MARCA",
  "USOPROD",
  "CODVOL",
  "CODGRUPOPROD",
  "GRUPODESCPROD",
  "UNIDADE",
  "ATIVO",
];

function parseAtivo(value: string | null | undefined): 0 | 1 {
  if (value == null) return 0;
  const text = String(value).trim().toUpperCase();
  if (text === "S" || text === "1") return 1;
  return 0;
}

function sankhyaText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return null;
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
         (CODPROD, DESCRPROD, REFERENCIA, MARCA, USOPROD, CODVOL,
          CODGRUPOPROD, GRUPO_DESCR, UNIDADE, ativo, synced_at)
       VALUES
         (@CODPROD, @DESCRPROD, @REFERENCIA, @MARCA, @USOPROD, @CODVOL,
          @CODGRUPOPROD, @GRUPO_DESCR, @UNIDADE, @ativo, @synced_at)
       ON CONFLICT(CODPROD) DO UPDATE SET
         DESCRPROD     = excluded.DESCRPROD,
         REFERENCIA    = excluded.REFERENCIA,
         MARCA         = excluded.MARCA,
         USOPROD       = excluded.USOPROD,
         CODVOL        = excluded.CODVOL,
         CODGRUPOPROD  = excluded.CODGRUPOPROD,
         GRUPO_DESCR   = excluded.GRUPO_DESCR,
         UNIDADE       = excluded.UNIDADE,
         ativo         = excluded.ativo,
         synced_at     = excluded.synced_at`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const row of records) {
        const record = row as Record<string, unknown>;
        const codprod = parseIntOrNull(sankhyaText(record.CODPROD));
        if (codprod == null) continue;

        upsert.run({
          CODPROD: codprod,
          DESCRPROD: sankhyaText(record.DESCRPROD) ?? "",
          REFERENCIA: sankhyaText(record.REFERENCIA),
          MARCA: sankhyaText(record.MARCA),
          USOPROD: sankhyaText(record.USOPROD),
          CODVOL: sankhyaText(record.CODVOL),
          CODGRUPOPROD: parseIntOrNull(sankhyaText(record.CODGRUPOPROD)),
          GRUPO_DESCR: sankhyaText(record.GRUPODESCPROD),
          UNIDADE: sankhyaText(record.UNIDADE) ?? sankhyaText(record.CODVOL),
          ativo: parseAtivo(sankhyaText(record.ATIVO)),
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
