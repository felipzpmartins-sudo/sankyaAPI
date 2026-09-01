import { getDb } from "../db/connection.js";
import { countRows, executeQuery, executeQueryByCursor } from "../sankhya/query.js";
import { parseIntOrNull } from "../utils/numbers.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const ORIGEM = "TGFPRO";
const FILTRO = "1 = 1";

/** Colunas de TGFPRO, conferidas em ALL_TAB_COLUMNS. */
const COLUNAS = [
  "CODPROD",
  "DESCRPROD",
  "REFERENCIA",
  "MARCA",
  "USOPROD",
  "CODVOL",
  "CODGRUPOPROD",
  "UNIDADE",
  "ATIVO",
].join(", ");

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

/**
 * A descricao do grupo nao vem na entidade Produto: "GRUPODESCPROD" e aceito
 * como descritor mas volta vazio, e era por isso que GRUPO_DESCR ficava 100%
 * nulo e o grafico de estoque por categoria jogava tudo em "Outros". O nome
 * mora na TGFGRU, que tem 9 linhas — cabe numa consulta so.
 */
async function loadGrupos(): Promise<Map<number, string>> {
  const mapa = new Map<number, string>();
  try {
    const r = await executeQuery("SELECT CODGRUPOPROD, DESCRGRUPOPROD FROM TGFGRU");
    for (const linha of r.rows) {
      const codigo = Number(linha[0]);
      const descricao = linha[1] == null ? null : String(linha[1]).trim();
      if (Number.isFinite(codigo) && descricao) mapa.set(codigo, descricao);
    }
  } catch {
    // Sem a descricao os produtos continuam sincronizando; so o rotulo some.
  }
  return mapa;
}

async function loadProducts(): Promise<unknown[]> {
  const esperado = await countRows(ORIGEM, FILTRO);
  const rows = await executeQueryByCursor({
    select: COLUNAS,
    from: ORIGEM,
    where: FILTRO,
    key: "CODPROD",
  });

  if (rows.length !== esperado) {
    throw new Error(
      `leitura de produtos incompleta: ${rows.length} de ${esperado} no Sankhya`,
    );
  }
  return rows;
}

export async function syncProdutos(): Promise<void> {
  try {
    const [records, grupos] = await Promise.all([loadProducts(), loadGrupos()]);
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
        const codgrupo = parseIntOrNull(sankhyaText(record.CODGRUPOPROD));

        upsert.run({
          CODPROD: codprod,
          DESCRPROD: sankhyaText(record.DESCRPROD) ?? "",
          REFERENCIA: sankhyaText(record.REFERENCIA),
          MARCA: sankhyaText(record.MARCA),
          USOPROD: sankhyaText(record.USOPROD),
          CODVOL: sankhyaText(record.CODVOL),
          CODGRUPOPROD: codgrupo,
          GRUPO_DESCR: codgrupo == null ? null : grupos.get(codgrupo) ?? null,
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
