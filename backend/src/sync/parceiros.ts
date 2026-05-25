import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import type { DecodedEntity } from "../sankhya/types.js";
import { parseDateBR } from "../utils/dates.js";
import { parseDecimal } from "../utils/numbers.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const FIELDSETS = [
  [
    "CODPARC",
    "NOMEPARC",
    "RAZAOSOCIAL",
    "CGC_CPF",
    "TIPPESSOA",
    "EMAIL",
    "TELEFONE",
    "CELULAR",
    "DTCAD",
    "LIMCRED",
    "CLIENTE",
    "FORNECEDOR",
    "ATIVO",
  ],
  [
    "CODPARC",
    "NOMEPARC",
    "RAZAOSOCIAL",
    "CGC_CPF",
    "TIPPESSOA",
    "EMAIL",
    "TELEFONE",
    "DTCAD",
    "CLIENTE",
    "FORNECEDOR",
    "ATIVO",
  ],
  ["CODPARC", "NOMEPARC", "RAZAOSOCIAL", "CGC_CPF", "TIPPESSOA", "CLIENTE", "FORNECEDOR", "ATIVO"],
] as const;

function text(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

async function loadParceiros(): Promise<DecodedEntity[]> {
  let lastError: unknown;
  for (const fields of FIELDSETS) {
    try {
      return await loadAllRecords({
        rootEntity: "Parceiro",
        fields: [...fields],
        expression: "this.ATIVO = 'S'",
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function syncParceiros(): Promise<void> {
  try {
    const rows = await loadParceiros();
    const db = getDb();
    const now = new Date().toISOString();

    const upsert = db.prepare(
      `INSERT INTO parceiros
         (CODPARC, NOMEPARC, RAZAOSOCIAL, CGC_CPF, TIPPESSOA, EMAIL, TELEFONE,
          CELULAR, DTCAD, LIMCRED, CIDADE, UF, is_cliente, is_fornecedor, ativo, synced_at)
       VALUES
         (@CODPARC, @NOMEPARC, @RAZAOSOCIAL, @CGC_CPF, @TIPPESSOA, @EMAIL, @TELEFONE,
          @CELULAR, @DTCAD, @LIMCRED, @CIDADE, @UF, @is_cliente, @is_fornecedor, @ativo, @synced_at)
       ON CONFLICT(CODPARC) DO UPDATE SET
         NOMEPARC      = excluded.NOMEPARC,
         RAZAOSOCIAL   = excluded.RAZAOSOCIAL,
         CGC_CPF       = excluded.CGC_CPF,
         TIPPESSOA     = excluded.TIPPESSOA,
         EMAIL         = excluded.EMAIL,
         TELEFONE      = excluded.TELEFONE,
         CELULAR       = excluded.CELULAR,
         DTCAD         = excluded.DTCAD,
         LIMCRED       = excluded.LIMCRED,
         CIDADE        = excluded.CIDADE,
         UF            = excluded.UF,
         is_cliente    = excluded.is_cliente,
         is_fornecedor = excluded.is_fornecedor,
         ativo         = excluded.ativo,
         synced_at     = excluded.synced_at`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const row of rows) {
        const codparc = Number(row.CODPARC);
        if (!Number.isFinite(codparc)) continue;

        upsert.run({
          CODPARC: codparc,
          NOMEPARC: text(row.NOMEPARC) ?? `PARCEIRO ${codparc}`,
          RAZAOSOCIAL: text(row.RAZAOSOCIAL),
          CGC_CPF: text(row.CGC_CPF),
          TIPPESSOA: text(row.TIPPESSOA),
          EMAIL: text(row.EMAIL),
          TELEFONE: text(row.TELEFONE),
          CELULAR: text(row.CELULAR),
          DTCAD: parseDateBR(text(row.DTCAD)),
          LIMCRED: parseDecimal(text(row.LIMCRED)),
          CIDADE: null,
          UF: null,
          is_cliente: text(row.CLIENTE) === "S" ? 1 : 0,
          is_fornecedor: text(row.FORNECEDOR) === "S" ? 1 : 0,
          ativo: text(row.ATIVO) === "N" ? 0 : 1,
          synced_at: now,
        });
        inserted += 1;
      }
    });
    tx();

    recordSyncSuccess({ entity: "parceiros", rowCount: inserted, fullSync: true });
  } catch (err) {
    recordSyncError("parceiros", err);
    throw err;
  }
}
