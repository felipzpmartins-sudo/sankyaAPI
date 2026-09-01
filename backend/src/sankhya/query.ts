import { sankhyaRequest } from "./client.js";
import type { DecodedEntity } from "./types.js";

type QueryFieldMeta = {
  name?: string;
};

type ExecuteQueryRawResponse = {
  status: "0" | "1";
  statusMessage?: string;
  responseBody?: {
    fieldsMetadata?: QueryFieldMeta[];
    rows?: unknown[][];
  };
};

export type ExecuteQueryResult = {
  fields: string[];
  rows: unknown[][];
};

export async function executeQuery(sql: string): Promise<ExecuteQueryResult> {
  const raw = await sankhyaRequest<ExecuteQueryRawResponse>({
    method: "POST",
    path: "/gateway/v1/mge/service.sbr",
    query: {
      serviceName: "DbExplorerSP.executeQuery",
      outputType: "json",
    },
    body: {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: {
        sql,
      },
    },
  });

  if (raw.status !== "1") {
    throw new Error(`Sankhya query erro: ${raw.statusMessage ?? "desconhecido"}`);
  }

  return {
    fields: (raw.responseBody?.fieldsMetadata ?? []).map((f) => f.name ?? ""),
    rows: raw.responseBody?.rows ?? [],
  };
}

export type CursorQueryArgs = {
  /** Lista do SELECT ja formatada, incluindo a coluna de cursor. */
  select: string;
  /** Tabela (ou join) de origem, sem WHERE nem ORDER BY. */
  from: string;
  /** Filtro fixo da varredura. O cursor e adicionado com AND. */
  where: string;
  /** Coluna crescente que ancora a paginacao. */
  key: string;
  /**
   * Marque quando a chave se repete na origem (uma linha por item de um
   * mesmo codigo, por exemplo). A varredura passa a ler a partir da chave
   * inclusive e descarta o ultimo grupo de cada pagina cheia, que pode ter
   * sido cortado no meio.
   */
  keyRepeats?: boolean;
  pageSize?: number;
};

/**
 * Varre uma consulta grande em paginas ancoradas numa chave unica crescente.
 *
 * O `offsetPage` do CRUDServiceProvider — e qualquer paginacao por offset —
 * recalcula a posicao a cada requisicao. Sobre tabela viva isso repete linhas
 * numa pagina e pula outras: a varredura de TGFFIN devolvia 42.831 linhas
 * cobrindo so 42.283 NUFIN distintos, e a de TGFCAB 9.144 linhas cobrindo
 * 9.011 NUNOTA. As linhas puladas nao eram apenas ignoradas — como nao
 * chegavam com o carimbo do ciclo, a limpeza de orfaos as apagava do
 * snapshot. Era a causa de o painel nao bater com o Sankhya.
 *
 * Ancorar em `chave > ultima lida` nao tem esse modo de falha: cada linha
 * aparece no maximo uma vez e nenhuma e pulada, independente do que entre ou
 * saia da tabela no meio da varredura.
 *
 * A chave PRECISA ser unica na origem. Para chaves com repeticao, ver o
 * descarte do ultimo grupo em sync/rateio.ts.
 */
export async function executeQueryByCursor(
  args: CursorQueryArgs,
): Promise<DecodedEntity[]> {
  const pageSize = args.pageSize ?? 5_000;
  const keyName = args.key.split(".").pop()!.toUpperCase();
  const todas: DecodedEntity[] = [];
  let cursor: number | null = null;

  for (let pagina = 0; ; pagina += 1) {
    if (pagina > 1_000) throw new Error("executeQueryByCursor: limite de paginacao excedido");

    const comparador = args.keyRepeats ? ">=" : ">";
    const filtroCursor =
      cursor === null ? "" : ` AND ${args.key} ${comparador} ${cursor}`;
    const result = await executeQuery(`
      SELECT * FROM (
        SELECT ${args.select}
        FROM ${args.from}
        WHERE ${args.where}${filtroCursor}
        ORDER BY ${args.key}
      ) WHERE ROWNUM <= ${pageSize}
    `);

    if (result.rows.length === 0) break;

    const indice = new Map(result.fields.map((field, i) => [field, i]));
    const posicaoChave = indice.get(keyName);
    if (posicaoChave === undefined) {
      throw new Error(`executeQueryByCursor: coluna de cursor '${keyName}' ausente no retorno`);
    }

    // Mesma forma que o decoder do CRUD entrega: os parsers de data e valor
    // do sync recebem string.
    const converte = (row: unknown[]): DecodedEntity => {
      const registro: DecodedEntity = {};
      for (const [field, i] of indice) {
        const valor = row[i];
        registro[field] = valor == null ? null : String(valor);
      }
      return registro;
    };

    const paginaCheia = result.rows.length >= pageSize;
    const chaveDe = (row: unknown[]) => Number(row[posicaoChave]);

    if (!paginaCheia) {
      for (const row of result.rows) todas.push(converte(row));
      break;
    }

    const ultimaChave = chaveDe(result.rows[result.rows.length - 1]);
    if (!Number.isFinite(ultimaChave)) {
      throw new Error("executeQueryByCursor: cursor nao numerico");
    }

    if (!args.keyRepeats) {
      for (const row of result.rows) todas.push(converte(row));
      cursor = ultimaChave;
      continue;
    }

    // Chave repetida: o ultimo grupo pode ter sido cortado pelo teto da
    // pagina. Descarta e retoma a partir dele.
    const completos = result.rows.filter((row) => chaveDe(row) < ultimaChave);
    if (completos.length === 0) {
      // Um unico valor de chave ocupa a pagina inteira: aceita e avanca,
      // senao a varredura trava relendo sempre a mesma pagina.
      for (const row of result.rows) todas.push(converte(row));
      cursor = ultimaChave + 1;
      continue;
    }

    for (const row of completos) todas.push(converte(row));
    cursor = ultimaChave;
  }

  return todas;
}

/** Conta as linhas da origem com o mesmo filtro da varredura. */
export async function countRows(from: string, where: string): Promise<number> {
  const result = await executeQuery(`SELECT COUNT(*) AS TOTAL FROM ${from} WHERE ${where}`);
  return Number(result.rows[0]?.[0] ?? 0);
}
