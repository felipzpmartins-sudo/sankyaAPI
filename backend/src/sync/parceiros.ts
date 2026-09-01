import { getDb } from "../db/connection.js";
import { countRows, executeQuery, executeQueryByCursor } from "../sankhya/query.js";
import type { DecodedEntity } from "../sankhya/types.js";
import { parseDateBR } from "../utils/dates.js";
import { parseDecimal } from "../utils/numbers.js";
import pino from "pino";
import { config } from "../config.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const logger = pino({ level: config.LOG_LEVEL, transport: { target: "pino-pretty", options: { colorize: true } } });

const ORIGEM = "TGFPAR";
const FILTRO = "ATIVO = 'S'";

/**
 * Colunas de TGFPAR, todas conferidas em ALL_TAB_COLUMNS.
 *
 * CELULAR nao entra porque nao existe na tabela — o descritor recusado pela
 * API nao era um problema de permissao. A coluna permanece no schema local,
 * sempre nula. LIMCRED entra e e valido: no ERP ele e nulo para os 7.403
 * parceiros ativos, entao zero no snapshot e o valor correto.
 */
const COLUNAS = [
  "CODPARC",
  "NOMEPARC",
  "RAZAOSOCIAL",
  "CGC_CPF",
  "TIPPESSOA",
  "EMAIL",
  "TELEFONE",
  "TO_CHAR(DTCAD, 'DD/MM/YYYY') AS DTCAD",
  "LIMCRED",
  "CODCID",
  "CLIENTE",
  "FORNECEDOR",
  "ATIVO",
].join(", ");

type Localidade = { cidade: string; uf: string };

/**
 * TGFPAR nao expoe cidade nem UF como texto — os descritores "CIDADE" e "UF"
 * sao recusados pela API. O que existe e CODCID, que resolve em TSICID, cuja
 * coluna UF por sua vez e o codigo numerico de TSIUFS. Sem este join os dois
 * campos ficavam 100% nulos e a quebra geografica da tela de clientes vinha
 * vazia. Paginado por cursor em CODCID para nao esbarrar no teto de 5.000.
 */
async function loadLocalidades(): Promise<Map<number, Localidade>> {
  const mapa = new Map<number, Localidade>();
  const pageSize = 5_000;
  let cursor = 0;

  try {
    for (let pagina = 0; pagina < 100; pagina += 1) {
      const r = await executeQuery(`
        SELECT CODCID, NOMECID, UF FROM (
          SELECT CID.CODCID, CID.NOMECID, UFS.UF
          FROM TSICID CID
          INNER JOIN TSIUFS UFS ON UFS.CODUF = CID.UF
          WHERE CID.CODCID >= ${cursor}
          ORDER BY CID.CODCID
        ) WHERE ROWNUM <= ${pageSize}
      `);
      if (r.rows.length === 0) break;

      let maior = cursor;
      for (const linha of r.rows) {
        const codigo = Number(linha[0]);
        if (!Number.isFinite(codigo)) continue;
        const cidade = linha[1] == null ? "" : String(linha[1]).trim();
        const uf = linha[2] == null ? "" : String(linha[2]).trim();
        if (cidade) mapa.set(codigo, { cidade, uf });
        if (codigo > maior) maior = codigo;
      }

      if (r.rows.length < pageSize) break;
      if (maior <= cursor) break;
      cursor = maior + 1;
    }
  } catch {
    // Sem o mapa os parceiros continuam sincronizando; so cidade/UF ficam nulos.
  }

  return mapa;
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/**
 * Varredura por cursor em CODPARC. A versao anterior ia pela entidade
 * Parceiro do CRUD com tres conjuntos de campos em cascata, porque um
 * descritor invalido derrubava a carga inteira. Em SQL cru o problema nao
 * existe: as colunas sao conferidas no dicionario do banco.
 */
async function loadParceiros(): Promise<DecodedEntity[]> {
  const esperado = await countRows(ORIGEM, FILTRO);
  const rows = await executeQueryByCursor({
    select: COLUNAS,
    from: ORIGEM,
    where: FILTRO,
    key: "CODPARC",
  });

  if (rows.length !== esperado) {
    logger.warn({ esperado, lidos: rows.length }, "leitura de parceiros incompleta");
  }
  return rows;
}

export async function syncParceiros(): Promise<void> {
  try {
    const [rows, localidades] = await Promise.all([loadParceiros(), loadLocalidades()]);
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
        const codcid = Number(row.CODCID);
        const localidade = Number.isFinite(codcid) ? localidades.get(codcid) : undefined;

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
          CIDADE: localidade?.cidade ?? null,
          UF: localidade?.uf ?? null,
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
