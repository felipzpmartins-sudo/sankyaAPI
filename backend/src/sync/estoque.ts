import { getDb } from "../db/connection.js";
import { countRows, executeQuery, executeQueryByCursor } from "../sankhya/query.js";
import { parseDecimal, parseIntOrNull } from "../utils/numbers.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const ORIGEM = "TGFEST";
const FILTRO = "1 = 1";

/** Colunas de TGFEST, conferidas em ALL_TAB_COLUMNS. */
const COLUNAS = [
  "CODPROD",
  "CODLOCAL",
  "ESTOQUE",
  "ESTMIN",
  "ESTMAX",
  "CODEMP",
  "CONTROLE",
  "CODPARC",
  "TIPO",
].join(", ");

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

/**
 * A chave de TGFEST e composta (empresa, produto, local, controle, parceiro,
 * tipo), entao o cursor anda por CODPROD com descarte do ultimo grupo — sao
 * 5.004 linhas para 2.750 produtos.
 *
 * A leitura precisa vir inteira: syncEstoque apaga a tabela antes de
 * regravar, entao uma varredura parcial some com saldo em vez de apenas
 * deixar de atualizar.
 */
async function loadStockFromEstoque(): Promise<unknown[]> {
  const esperado = await countRows(ORIGEM, FILTRO);
  const rows = await executeQueryByCursor({
    select: COLUNAS,
    from: ORIGEM,
    where: FILTRO,
    key: "CODPROD",
    keyRepeats: true,
  });

  if (rows.length !== esperado) {
    throw new Error(
      `leitura de estoque incompleta: ${rows.length} de ${esperado} no Sankhya`,
    );
  }
  return rows;
}

/**
 * DESCRLOCAL nao esta em TGFEST; vinha do campo de apresentacao
 * LocalFinanceiro_DESCRLOCAL do CRUD, que nunca chegava preenchido. Sao 469
 * locais — cabe numa consulta so.
 */
async function loadLocais(): Promise<Map<number, string>> {
  const mapa = new Map<number, string>();
  try {
    const r = await executeQuery("SELECT CODLOCAL, DESCRLOCAL FROM TGFLOC");
    for (const linha of r.rows) {
      const codigo = Number(linha[0]);
      const descricao = linha[1] == null ? null : String(linha[1]).trim();
      if (Number.isFinite(codigo) && descricao) mapa.set(codigo, descricao);
    }
  } catch {
    // Sem a descricao o saldo continua correto; so o rotulo do local some.
  }
  return mapa;
}

export async function syncEstoque(): Promise<void> {
  try {
    const [records, locais] = await Promise.all([
      loadStockFromEstoque(),
      loadLocais(),
    ]);

    const db = getDb();
    const now = new Date().toISOString();

    // Nomes de empresa e parceiro vinham dos campos de apresentacao do CRUD e
    // ficavam nulos. Resolvidos no snapshot, que ja tem as duas tabelas.
    const nomeEmpresa = new Map<number, string>(
      (db.prepare("SELECT CODEMP, NOMEFANTASIA FROM empresas").all() as {
        CODEMP: number;
        NOMEFANTASIA: string;
      }[]).map((empresa) => [empresa.CODEMP, empresa.NOMEFANTASIA]),
    );
    const nomeParceiro = new Map<number, string>(
      (db.prepare("SELECT CODPARC, NOMEPARC FROM parceiros").all() as {
        CODPARC: number;
        NOMEPARC: string;
      }[]).map((parceiro) => [parceiro.CODPARC, parceiro.NOMEPARC]),
    );

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
        const codemp = parseZeroableInt(sankhyaValue(record.CODEMP));
        const codlocal = parseZeroableInt(sankhyaValue(record.CODLOCAL));
        const codparc = parseZeroableInt(sankhyaValue(record.CODPARC));

        upsert.run({
          CODEMP: codemp,
          CODPROD: codprod,
          CODLOCALORIG: codlocal,
          CONTROLE: sankhyaText(record.CONTROLE) ?? "",
          CODPARC: codparc,
          TIPO: sankhyaText(record.TIPO) ?? "",
          ESTOQUE: normalizeStockValue(sankhyaValue(record.ESTOQUE)),
          EST_MINIMO: normalizeStockValue(sankhyaValue(record.ESTMIN)),
          EST_MAXIMO: normalizeStockValue(sankhyaValue(record.ESTMAX)),
          UNIDADE: null,
          LOCAL_DESCR: locais.get(codlocal) ?? null,
          EMPRESA_NOMEFANTASIA: nomeEmpresa.get(codemp) ?? null,
          PARCEIRO_NOMEPARC: codparc > 0 ? nomeParceiro.get(codparc) ?? null : null,
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
