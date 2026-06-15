import { getDb } from "../db/connection.js";
import { type EmpresaFiltro, empresaToSqlClause } from "../utils/empresa.js";
import {
  describeVendedorFiltro,
  type VendedorFiltro,
  vendedorToSqlClause,
} from "../utils/vendedor.js";
import {
  COMODATO_RETORNO_TOPS,
  COMODATO_SAIDA_TOPS,
  FATURAMENTO_TOPS,
  inListClause,
} from "./operacoes.js";

/**
 * Empresa do snapshot. `ordem` < 99 = empresa do seed conhecida;
 * 99 = stub auto-criado pelo `syncPedidos` para um CODEMP que apareceu
 * em vendas mas não está no seed (ver `sync/empresas.ts`).
 */
export type Empresa = {
  CODEMP: number;
  NOMEFANTASIA: string;
  ordem: number;
  ativa: 0 | 1;
};

export type FaturamentoConsolidado = {
  filtro: string;
  dia: number;
  semana_7d: number;
  mes_atual: number;
  ano_atual: number;
  snapshot_at: string | null;
};

export type FaturamentoEmpresa = {
  CODEMP: number;
  NOMEFANTASIA: string;
  faturamento: number;
  percentual: number;
};

export type Vendedor = {
  CODVEND: number;
  APELIDO: string;
  ativo: 0 | 1;
};

export type Produto = {
  CODPROD: number;
  DESCRPROD: string;
  REFERENCIA: string | null;
  MARCA: string | null;
  USOPROD: string | null;
  CODVOL: string | null;
  CODGRUPOPROD: number | null;
  GRUPO_DESCR: string | null;
  UNIDADE: string | null;
  ativo: 0 | 1;
  ESTOQUE: number;
  EST_MINIMO: number;
  EST_MAXIMO: number;
  synced_at: string;
};

export function listarProdutos(): Produto[] {
  return getDb()
    .prepare(
      `SELECT p.CODPROD,
              p.DESCRPROD,
              p.REFERENCIA,
              p.MARCA,
              p.USOPROD,
              p.CODVOL,
              p.CODGRUPOPROD,
              p.GRUPO_DESCR,
              p.UNIDADE,
              p.ativo,
              COALESCE(SUM(e.ESTOQUE), 0) AS ESTOQUE,
              COALESCE(SUM(e.EST_MINIMO), 0) AS EST_MINIMO,
              COALESCE(SUM(e.EST_MAXIMO), 0) AS EST_MAXIMO,
              p.synced_at
       FROM produtos p
       LEFT JOIN produto_estoque e ON e.CODPROD = p.CODPROD
       WHERE p.ativo = 1
       GROUP BY p.CODPROD
       ORDER BY p.DESCRPROD`,
    )
    .all() as Produto[];
}

/**
 * Critério canônico de "faturamento" usado em TODOS os endpoints da tela 14.1.
 *
 * - `CODTIPOPER IN (FATURAMENTO_TOPS)` → apenas TOPs que são receita real
 *   (ver `services/operacoes.ts`; lista revisada com financeiro 2026-05-15).
 *   Antes era `TIPMOV='V'` que inflava ~22% com remessas, bonificações,
 *   ajustes, comodato, etc.
 * - `STATUSNOTA='L'` → nota liberada (não cancelada nem pendente).
 * - `DTFATUR IS NOT NULL` → faturada (exclui pedidos abertos).
 *
 * Janela de produto: só data de **faturamento (`DTFATUR`)** dentro deste ano civil
 * aparece nos KPIs e no gráfico por empresa (`PLAN`/stakeholder 2026-05-14).
 */
const WHERE_FATURAMENTO = `${inListClause("CODTIPOPER", FATURAMENTO_TOPS)} AND STATUSNOTA = 'L' AND DTFATUR IS NOT NULL`;

const ANO_EXIBICAO_FATURAMENTO = "2026";

const JOIN_PEDIDO_FATURAMENTO = `${inListClause("p.CODTIPOPER", FATURAMENTO_TOPS)} AND p.STATUSNOTA = 'L' AND p.DTFATUR IS NOT NULL`;

/**
 * Apenas empresas do seed (ordem < 99) aparecem no seletor/gráficos da tela 14.1.
 * Stubs auto-criados (ordem=99) ficam invisíveis até o sync da entidade Empresa
 * trazer os dados reais (ver PLAN_DATA_BASE.md seção 15.1).
 */
const WHERE_EMPRESA_VISIVEL = `ordem < 99`;

function describeFiltro(filtro: EmpresaFiltro): string {
  return filtro.modo === "todas" ? "todas" : `lista[${filtro.ids.join(",")}]`;
}

function describeFiltros(empresa: EmpresaFiltro, vendedor: VendedorFiltro): string {
  return `empresa=${describeFiltro(empresa)};vendedor=${describeVendedorFiltro(vendedor)}`;
}

function snapshotPedidosAt(): string | null {
  const row = getDb()
    .prepare("SELECT last_synced_at FROM sync_state WHERE entity = 'pedidos'")
    .get() as { last_synced_at: string | null } | undefined;
  return row?.last_synced_at ?? null;
}

function todayLocalIso(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeReferenceDate(data?: string): string {
  return data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : todayLocalIso();
}

function addDaysIso(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function periodoDateRange(dataReferencia: string, periodo: PeriodoVendas): [string, string] {
  const [year, month] = dataReferencia.split("-").map(Number);

  if (periodo === "dia") {
    return [dataReferencia, addDaysIso(dataReferencia, 1)];
  }

  if (periodo === "mes") {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(Date.UTC(year, month, 1));
    return [start, endDate.toISOString().slice(0, 10)];
  }

  return [`${year}-01-01`, `${year + 1}-01-01`];
}

function vendasPeriodoClause(coluna: string): string {
  return `${coluna} >= date(?) AND ${coluna} < date(?)`;
}

export function listarEmpresas(): Empresa[] {
  return getDb()
    .prepare(
      `SELECT CODEMP, NOMEFANTASIA, ordem, ativa
       FROM empresas
       WHERE ${WHERE_EMPRESA_VISIVEL}
       ORDER BY ordem, CODEMP`,
    )
    .all() as Empresa[];
}

export function listarVendedores(): Vendedor[] {
  return getDb()
    .prepare(
      `SELECT CODVEND, APELIDO, ativo
       FROM vendedores
       ORDER BY ativo DESC, APELIDO`,
    )
    .all() as Vendedor[];
}

export type VendedorRankingLinha = {
  CODVEND: number;
  APELIDO: string;
  ativo: 0 | 1;
  faturamento: number;
  percentual: number;
};

export type PeriodoVendas = "dia" | "mes" | "ano";

export type LancamentoHojeLinha = {
  NUNOTA: number;
  NUMNOTA: number | null;
  SERIENOTA: string | null;
  empresa: string;
  CODVEND: number | null;
  APELIDO: string | null;
  itens: string;
  valor: number;
};

export function lancamentosHoje(
  vendedor: VendedorFiltro = { modo: "todos" },
  dataReferencia?: string,
): {
  periodo: string;
  total: number;
  snapshot_at: string | null;
  lancamentos: LancamentoHojeLinha[];
} {
  const refDate = normalizeReferenceDate(dataReferencia);
  const vendedorSql = vendedorToSqlClause(vendedor, "p.CODVEND");
  const vendedorJoin = vendedorSql.clause ? ` AND ${vendedorSql.clause}` : "";

  const rows = getDb()
    .prepare(
      `SELECT
         p.NUNOTA,
         p.NUMNOTA,
         p.SERIENOTA,
         COALESCE(e.NOMEFANTASIA, '-') AS empresa,
         p.CODVEND,
         v.APELIDO,
         COALESCE(p.VLRNOTA, 0) AS valor,
         COALESCE(
           GROUP_CONCAT(SUBSTR(pr.DESCRPROD, 1, 40), ', '),
           ''
         ) AS itens
       FROM pedidos p
       LEFT JOIN vendedores v ON v.CODVEND = p.CODVEND
       LEFT JOIN empresas e ON e.CODEMP = p.CODEMP
       LEFT JOIN pedido_itens pi ON pi.NUNOTA = p.NUNOTA
       LEFT JOIN produtos pr ON pr.CODPROD = pi.CODPROD
       WHERE ${WHERE_FATURAMENTO}
         AND DTFATUR = date(?)${vendedorJoin}
       GROUP BY p.NUNOTA, p.NUMNOTA, p.SERIENOTA, e.NOMEFANTASIA, p.CODVEND, v.APELIDO, p.VLRNOTA
       ORDER BY p.DTFATUR DESC, p.NUNOTA DESC
       LIMIT 5`,
    )
    .all(refDate, ...vendedorSql.params) as {
      NUNOTA: number;
      NUMNOTA: number | null;
      SERIENOTA: string | null;
      empresa: string;
      CODVEND: number | null;
      APELIDO: string | null;
      itens: string;
      valor: number;
    }[];

  const total = rows.reduce((acc, row) => acc + row.valor, 0);

  return {
    periodo: `dia:${refDate}`,
    total: round2(total),
    snapshot_at: snapshotPedidosAt(),
    lancamentos: rows.map((row) => ({
      NUNOTA: row.NUNOTA,
      NUMNOTA: row.NUMNOTA,
      SERIENOTA: row.SERIENOTA,
      empresa: row.empresa,
      CODVEND: row.CODVEND,
      APELIDO: row.APELIDO,
      itens: row.itens,
      valor: round2(row.valor),
    })),
  };
}

export function vendedoresRanking(
  dataReferencia?: string,
  periodo: PeriodoVendas = "ano",
): {
  periodo: string;
  total: number;
  snapshot_at: string | null;
  ranking: VendedorRankingLinha[];
} {
  const refDate = normalizeReferenceDate(dataReferencia);
  const [periodoInicio, periodoFim] = periodoDateRange(refDate, periodo);
  const rows = getDb()
    .prepare(
      `SELECT
         v.CODVEND,
         v.APELIDO,
         v.ativo,
         COALESCE(SUM(p.VLRNOTA), 0) AS faturamento
       FROM vendedores v
       LEFT JOIN pedidos p
         ON p.CODVEND = v.CODVEND
         AND ${JOIN_PEDIDO_FATURAMENTO}
         AND ${vendasPeriodoClause("p.DTFATUR")}
       GROUP BY v.CODVEND, v.APELIDO, v.ativo
       ORDER BY faturamento DESC, v.APELIDO`,
    )
    .all(periodoInicio, periodoFim) as {
    CODVEND: number;
    APELIDO: string;
    ativo: 0 | 1;
    faturamento: number;
  }[];

  const total = rows.reduce((acc, row) => acc + row.faturamento, 0);

  return {
    periodo: `${periodo}:${refDate}`,
    total: round2(total),
    snapshot_at: snapshotPedidosAt(),
    ranking: rows.map((row) => ({
      CODVEND: row.CODVEND,
      APELIDO: row.APELIDO,
      ativo: row.ativo,
      faturamento: round2(row.faturamento),
      percentual: total > 0 ? round2((row.faturamento / total) * 100) : 0,
    })),
  };
}

export function faturamentoConsolidado(
  empresa: EmpresaFiltro,
  vendedor: VendedorFiltro = { modo: "todos" },
  dataReferencia?: string,
): FaturamentoConsolidado {
  const refDate = normalizeReferenceDate(dataReferencia);
  const anoInicio = `${refDate.slice(0, 4)}-01-01`;
  const anoFim = `${Number(refDate.slice(0, 4)) + 1}-01-01`;
  const empresaSql = empresaToSqlClause(empresa);
  const vendedorSql = vendedorToSqlClause(vendedor);
  const whereExtras = [empresaSql.clause, vendedorSql.clause]
    .filter(Boolean)
    .map((c) => ` AND ${c}`)
    .join("");

  const sql = `
    WITH base AS (
      SELECT DTFATUR, VLRNOTA
      FROM pedidos
      WHERE ${WHERE_FATURAMENTO}${whereExtras}
        AND DTFATUR >= date(?) AND DTFATUR < date(?)
    )
    SELECT
      COALESCE((SELECT SUM(VLRNOTA) FROM base WHERE DTFATUR = date(?)), 0) AS dia,
      COALESCE((SELECT SUM(VLRNOTA) FROM base WHERE DTFATUR >= date(?, '-6 days') AND DTFATUR <= date(?)), 0) AS semana_7d,
      COALESCE((SELECT SUM(VLRNOTA) FROM base WHERE strftime('%Y-%m', DTFATUR) = strftime('%Y-%m', ?)), 0) AS mes_atual,
      COALESCE((SELECT SUM(VLRNOTA) FROM base), 0) AS ano_atual
  `;

  const row = getDb()
    .prepare(sql)
    .get(
      ...empresaSql.params,
      ...vendedorSql.params,
      anoInicio,
      anoFim,
      refDate,
      refDate,
      refDate,
      refDate,
    ) as {
    dia: number;
    semana_7d: number;
    mes_atual: number;
    ano_atual: number;
  };

  return {
    filtro: describeFiltros(empresa, vendedor),
    dia: round2(row.dia),
    semana_7d: round2(row.semana_7d),
    mes_atual: round2(row.mes_atual),
    ano_atual: round2(row.ano_atual),
    snapshot_at: snapshotPedidosAt(),
  };
}

/**
 * Distribuição do faturamento entre as empresas no ano corrente.
 *
 * Decisão de UX: o gráfico mostra **todas as empresas** mesmo quando uma
 * está selecionada nos cards de KPI — empresa não é aplicada como filtro.
 *
 * **Vendedor** é aplicado quando informado, pra responder perguntas como
 * "a Camila vendeu quanto em cada empresa?".
 */
export function faturamentoPorEmpresa(
  vendedor: VendedorFiltro = { modo: "todos" },
  dataReferencia?: string,
  periodo: PeriodoVendas = "ano",
): {
  periodo: string;
  total: number;
  snapshot_at: string | null;
  empresas: FaturamentoEmpresa[];
} {
  const refDate = normalizeReferenceDate(dataReferencia);
  const [periodoInicio, periodoFim] = periodoDateRange(refDate, periodo);
  const vendedorSql = vendedorToSqlClause(vendedor, "p.CODVEND");
  const vendedorJoin = vendedorSql.clause ? ` AND ${vendedorSql.clause}` : "";

  const rows = getDb()
    .prepare(
      `SELECT
         e.CODEMP,
         e.NOMEFANTASIA,
         COALESCE(SUM(p.VLRNOTA), 0) AS faturamento
       FROM empresas e
       LEFT JOIN pedidos p
         ON p.CODEMP = e.CODEMP
         AND ${JOIN_PEDIDO_FATURAMENTO}
         AND ${vendasPeriodoClause("p.DTFATUR")}${vendedorJoin}
       WHERE e.${WHERE_EMPRESA_VISIVEL}
       GROUP BY e.CODEMP, e.NOMEFANTASIA
       ORDER BY faturamento DESC`,
    )
    .all(periodoInicio, periodoFim, ...vendedorSql.params) as {
      CODEMP: number;
      NOMEFANTASIA: string;
      faturamento: number;
    }[];

  const total = rows.reduce((acc, r) => acc + r.faturamento, 0);

  const empresas: FaturamentoEmpresa[] = rows.map((r) => ({
    CODEMP: r.CODEMP,
    NOMEFANTASIA: r.NOMEFANTASIA,
    faturamento: round2(r.faturamento),
    percentual: total > 0 ? round2((r.faturamento / total) * 100) : 0,
  }));

  return {
    periodo: `${periodo}:${refDate}`,
    total: round2(total),
    snapshot_at: snapshotPedidosAt(),
    empresas,
  };
}

export type EmpresasResumo = {
  empresas: Empresa[];
  vendedores: Vendedor[];
  faturamento: FaturamentoConsolidado;
  faturamento_por_empresa: ReturnType<typeof faturamentoPorEmpresa>;
};

export function empresasResumo(
  empresa: EmpresaFiltro,
  vendedor: VendedorFiltro = { modo: "todos" },
  dataReferencia?: string,
  periodo: PeriodoVendas = "ano",
): EmpresasResumo {
  return {
    empresas: listarEmpresas(),
    vendedores: listarVendedores(),
    faturamento: faturamentoConsolidado(empresa, vendedor, dataReferencia),
    faturamento_por_empresa: faturamentoPorEmpresa(vendedor, dataReferencia, periodo),
  };
}

export type ComodatoConsolidado = {
  filtro: string;
  enviado: {
    dia: number;
    semana_7d: number;
    mes_atual: number;
    ano_atual: number;
    historico_total: number;
  };
  retornado: {
    dia: number;
    semana_7d: number;
    mes_atual: number;
    ano_atual: number;
    historico_total: number;
  };
  saldo_ativo: number;
  snapshot_at: string | null;
};

/**
 * Comodato — kits cedidos a escolas via contratos.
 *
 * Saída: TOPs `COMODATO_SAIDA_TOPS` (escola recebe).
 * Retorno: TOPs `COMODATO_RETORNO_TOPS` (kit volta pra Maker).
 * Saldo ativo: histórico de saídas − histórico de retornos (estimativa do
 * valor "no campo" — depende do snapshot ter cobertura total dos contratos
 * ativos, hoje a partir de 2025-01).
 *
 * Janela temporal segue a mesma regra do faturamento: usa `DTFATUR` (data
 * da nota) e o ano civil de `ANO_EXIBICAO_FATURAMENTO`.
 */
export function comodatoConsolidado(filtro: EmpresaFiltro): ComodatoConsolidado {
  const { clause, params } = empresaToSqlClause(filtro);
  const empresaWhere = clause ? ` AND ${clause}` : "";

  const buildSql = (tops: readonly number[]) => `
    WITH base AS (
      SELECT DTFATUR, VLRNOTA
      FROM pedidos
      WHERE ${inListClause("CODTIPOPER", tops)}
        AND STATUSNOTA = 'L'
        AND DTFATUR IS NOT NULL${empresaWhere}
    )
    SELECT
      COALESCE((SELECT SUM(VLRNOTA) FROM base WHERE DTFATUR = date('now')), 0) AS dia,
      COALESCE((SELECT SUM(VLRNOTA) FROM base WHERE DTFATUR >= date('now', '-6 days')), 0) AS semana_7d,
      COALESCE((SELECT SUM(VLRNOTA) FROM base WHERE strftime('%Y-%m', DTFATUR) = strftime('%Y-%m', 'now')), 0) AS mes_atual,
      COALESCE((SELECT SUM(VLRNOTA) FROM base WHERE strftime('%Y', DTFATUR) = ?), 0) AS ano_atual,
      COALESCE((SELECT SUM(VLRNOTA) FROM base), 0) AS historico_total
  `;

  const db = getDb();
  const enviado = db
    .prepare(buildSql(COMODATO_SAIDA_TOPS))
    .get(...params, ANO_EXIBICAO_FATURAMENTO) as {
    dia: number;
    semana_7d: number;
    mes_atual: number;
    ano_atual: number;
    historico_total: number;
  };
  const retornado = db
    .prepare(buildSql(COMODATO_RETORNO_TOPS))
    .get(...params, ANO_EXIBICAO_FATURAMENTO) as typeof enviado;

  return {
    filtro: describeFiltro(filtro),
    enviado: {
      dia: round2(enviado.dia),
      semana_7d: round2(enviado.semana_7d),
      mes_atual: round2(enviado.mes_atual),
      ano_atual: round2(enviado.ano_atual),
      historico_total: round2(enviado.historico_total),
    },
    retornado: {
      dia: round2(retornado.dia),
      semana_7d: round2(retornado.semana_7d),
      mes_atual: round2(retornado.mes_atual),
      ano_atual: round2(retornado.ano_atual),
      historico_total: round2(retornado.historico_total),
    },
    saldo_ativo: round2(enviado.historico_total - retornado.historico_total),
    snapshot_at: snapshotPedidosAt(),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
