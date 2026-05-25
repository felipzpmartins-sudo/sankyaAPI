import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { parseDecimal, parseIntOrNull } from "../utils/numbers.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const FIELDS_ESTOQUE = [
  "CODPROD",
  "CODLOCAL",
  "ESTOQUE",
  "ESTMIN",
  "ESTMAX",
  "CODEMP",
  "CONTROLE",
  "CODPARC",
  "TIPO",
];

function normalizeStockValue(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseDecimal(String(value));
}

function parseZeroableInt(value: string | number | null | undefined): number {
  const parsed = parseIntOrNull(value == null ? null : String(value));
  return parsed ?? 0;
}

function sankhyaValue(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
}

function sankhyaText(value: unknown): string | null {
  const raw = sankhyaValue(value);
  if (raw == null) return null;
  const text = String(raw).trim();
  return text === "" ? null : text;
}

async function loadStockFromEstoque(): Promise<unknown[]> {
  return await loadAllRecords({
    rootEntity: "Estoque",
    fields: FIELDS_ESTOQUE,
  });
}

export async function syncEstoque(): Promise<void> {
  try {
    const records = await loadStockFromEstoque();

    const db = getDb();
    const now = new Date().toISOString();

    const deleteAll = db.prepare("DELETE FROM produto_estoque");
    deleteAll.run();

    const upsert = db.prepare(
      `INSERT INTO produto_estoque
         (CODEMP, CODPROD, CODLOCALORIG, CONTROLE, CODPARC, TIPO,
          ESTOQUE, EST_MINIMO, EST_MAXIMO, UNIDADE,
          LOCAL_DESCR, EMPRESA_NOMEFANTASIA, PARCEIRO_NOMEPARC, synced_at)
       VALUES
         (@CODEMP, @CODPROD, @CODLOCALORIG, @CONTROLE, @CODPARC, @TIPO,
          @ESTOQUE, @EST_MINIMO, @EST_MAXIMO, @UNIDADE,
          @LOCAL_DESCR, @EMPRESA_NOMEFANTASIA, @PARCEIRO_NOMEPARC, @synced_at)
       ON CONFLICT(CODEMP, CODPROD, CODLOCALORIG, CONTROLE, CODPARC, TIPO) DO UPDATE SET
         ESTOQUE = excluded.ESTOQUE,
         EST_MINIMO = excluded.EST_MINIMO,
         EST_MAXIMO = excluded.EST_MAXIMO,
         UNIDADE = excluded.UNIDADE,
         LOCAL_DESCR = excluded.LOCAL_DESCR,
         EMPRESA_NOMEFANTASIA = excluded.EMPRESA_NOMEFANTASIA,
         PARCEIRO_NOMEPARC = excluded.PARCEIRO_NOMEPARC,
         synced_at = excluded.synced_at`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const row of records) {
        const record = row as Record<string, unknown>;
        const codprod = parseZeroableInt(sankhyaValue(record.CODPROD));
        if (codprod <= 0) continue;

        upsert.run({
          CODEMP: parseZeroableInt(sankhyaValue(record.CODEMP)),
          CODPROD: codprod,
          CODLOCALORIG: parseZeroableInt(sankhyaValue(record.CODLOCAL)),
          CONTROLE: sankhyaText(record.CONTROLE) ?? "",
          CODPARC: parseZeroableInt(sankhyaValue(record.CODPARC)),
          TIPO: sankhyaText(record.TIPO) ?? "",
          ESTOQUE: normalizeStockValue(sankhyaValue(record.ESTOQUE)),
          EST_MINIMO: normalizeStockValue(sankhyaValue(record.ESTMIN)),
          EST_MAXIMO: normalizeStockValue(sankhyaValue(record.ESTMAX)),
          UNIDADE: null,
          LOCAL_DESCR: sankhyaText(record.LocalFinanceiro_DESCRLOCAL),
          EMPRESA_NOMEFANTASIA: sankhyaText(record.Empresa_NOMEFANTASIA),
          PARCEIRO_NOMEPARC: sankhyaText(record.Parceiro_NOMEPARC),
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
