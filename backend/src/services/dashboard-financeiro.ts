import { getDb } from "../db/connection.js";
import { type EmpresaFiltro, empresaToSqlClause } from "../utils/empresa.js";
import { FATURAMENTO_TOPS, inListClause } from "./operacoes.js";

/**
 * Categorização do plano de contas Maker por prefixo do CODNAT.
 * Descoberto via análise da TGFNAT (264 naturezas).
 */
export const CATEGORIAS_NAT = {
  receitas: { prefixo: "1", label: "Receitas" },
  custos: { prefixo: "2", label: "Custos / Estoques" },
  despesas_admin: { prefixo: "3", label: "Despesas Administrativas" },
  despesas_comerciais: { prefixo: "4", label: "Despesas Comerciais" },
  impostos: { prefixo: "5", label: "Impostos / Tributos" },
  investimentos: { prefixo: "6", label: "Investimentos (CAPEX)" },
  dividendos: { prefixo: "7", label: "Dividendos / Distribuição" },
  servicos: { prefixo: "8", label: "Serviços" },
} as const;

export type Periodo = "mes" | "ano";
export type IntervaloDatas = {
  dataInicio?: string;
  dataFim?: string;
  codTipOper?: number[];
};

type Dre = {
  filtro: string;
  periodo: string;
  receita_bruta: number;
  custos: number;
  despesas_admin: number;
  despesas_comerciais: number;
  impostos: number;
  despesas_total: number;
  resultado_operacional: number;
  margem_pct: number;
  snapshot_at: string | null;
};

export type ContasAbertasResumo = {
  filtro: string;
  tipo: "receber" | "pagar";
  total: number;
  valor_total_aberto: number;
  snapshot_at: string | null;
};

export type FinanceiroResumo = {
  dre: Dre;
  distribuicao_despesas: ReturnType<typeof distribuicaoDespesas>;
  fluxo_caixa: ReturnType<typeof fluxoCaixa>;
  contas_receber: ContasAbertasResumo;
};

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function periodoRange(periodo: Periodo, intervalo: IntervaloDatas = {}): [string, string] {
  if (intervalo.dataInicio && intervalo.dataFim) {
    const end = new Date(`${intervalo.dataFim}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    return [intervalo.dataInicio, isoDate(end)];
  }

  const now = new Date();
  if (periodo === "mes") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return [isoDate(start), isoDate(addMonths(start, 1))];
  }

  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  return [isoDate(start), isoDate(end)];
}

function periodoClause(periodo: Periodo, coluna = "DTNEG", intervalo: IntervaloDatas = {}): string {
  void periodo;
  void intervalo;
  return `${coluna} >= ? AND ${coluna} < ?`;
}

function periodoParams(periodo: Periodo, intervalo: IntervaloDatas = {}): string[] {
  return periodoRange(periodo, intervalo);
}

function describePeriodo(periodo: Periodo, intervalo: IntervaloDatas = {}): string {
  if (intervalo.dataInicio && intervalo.dataFim) {
    return `intervalo:${intervalo.dataInicio}:${intervalo.dataFim}`;
  }
  return periodo === "mes"
    ? `mes_atual:${new Date().toISOString().slice(0, 7)}`
    : `ano_atual:${new Date().getFullYear()}`;
}

function describeFiltro(filtro: EmpresaFiltro): string {
  return filtro.modo === "todas" ? "todas" : `lista[${filtro.ids.join(",")}]`;
}

function snapshotTitulosAt(): string | null {
  const row = getDb()
    .prepare("SELECT last_synced_at FROM sync_state WHERE entity = 'titulos'")
    .get() as { last_synced_at: string | null } | undefined;
  return row?.last_synced_at ?? null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * DRE simplificado por regime de competência (DTNEG no período + PROVISAO='N').
 * Cada categoria soma `VLRDESDOB` das naturezas cujo CODNAT começa pelo prefixo.
 *
 * Filtros:
 *   - Receitas:  RECDESP =  1, CODNAT LIKE '1%'
 *   - Despesas:  RECDESP = -1, CODNAT LIKE '<prefixo>%'
 *   - PROVISAO = 'N' (apenas realizado, exclui provisões)
 *
 * Investimentos (prefixo 6) e Dividendos (prefixo 7) NÃO entram no
 * "despesas_total" do resultado operacional, pois afetam o lucro líquido
 * abaixo da linha (não o EBIT). Mantemos exibidos no payload pra contexto.
 */
export function dre(filtro: EmpresaFiltro, periodo: Periodo, intervalo: IntervaloDatas = {}): Dre {
  const { clause: empresaClause, params: empresaParams } = empresaToSqlClause(filtro);
  const empresaWhere = empresaClause ? ` AND ${empresaClause}` : "";
  const periodoWhere = periodoClause(periodo, "DTNEG", intervalo);
  const periodoWhereParams = periodoParams(periodo, intervalo);

  const baseWhere = `${periodoWhere} AND PROVISAO = 'N'${empresaWhere}`;

  const somaSql = (recdesp: 1 | -1, prefixo: string) => `
    SELECT COALESCE(SUM(VLRDESDOB), 0) AS total
    FROM titulos
    WHERE ${baseWhere}
      AND RECDESP = ${recdesp}
      AND CAST(COALESCE(CODNAT, 0) AS TEXT) LIKE '${prefixo}%'`;

  const db = getDb();
  const pedidoEmpresa = empresaToSqlClause(filtro, "CODEMP");
  const pedidoEmpresaWhere = pedidoEmpresa.clause ? ` AND ${pedidoEmpresa.clause}` : "";
  const receitaTops = intervalo.codTipOper && intervalo.codTipOper.length > 0
    ? intervalo.codTipOper
    : FATURAMENTO_TOPS;
  const receitaSql = `
    SELECT COALESCE(SUM(VLRNOTA), 0) AS total
    FROM pedidos
    WHERE ${periodoClause(periodo, "DTFATUR", intervalo)}
      AND ${inListClause("CODTIPOPER", receitaTops)}
      AND STATUSNOTA = 'L'
      AND DTFATUR IS NOT NULL${pedidoEmpresaWhere}`;

  const receita_bruta = (db
    .prepare(receitaSql)
    .get(...periodoWhereParams, ...pedidoEmpresa.params) as { total: number }).total;
  const custos = (db.prepare(somaSql(-1, "2")).get(...periodoWhereParams, ...empresaParams) as { total: number }).total;
  const despesas_admin = (db.prepare(somaSql(-1, "3")).get(...periodoWhereParams, ...empresaParams) as { total: number }).total;
  const despesas_comerciais = (db.prepare(somaSql(-1, "4")).get(...periodoWhereParams, ...empresaParams) as { total: number }).total;
  const impostos = (db.prepare(somaSql(-1, "5")).get(...periodoWhereParams, ...empresaParams) as { total: number }).total;

  const despesas_total = custos + despesas_admin + despesas_comerciais + impostos;
  const resultado_operacional = receita_bruta - despesas_total;
  const margem_pct = receita_bruta > 0 ? (resultado_operacional / receita_bruta) * 100 : 0;

  return {
    filtro: describeFiltro(filtro),
    periodo: describePeriodo(periodo, intervalo),
    receita_bruta: round2(receita_bruta),
    custos: round2(custos),
    despesas_admin: round2(despesas_admin),
    despesas_comerciais: round2(despesas_comerciais),
    impostos: round2(impostos),
    despesas_total: round2(despesas_total),
    resultado_operacional: round2(resultado_operacional),
    margem_pct: round2(margem_pct),
    snapshot_at: snapshotTitulosAt(),
  };
}

/**
 * Fluxo de caixa por mês (regime de caixa: usa DHBAIXA).
 * Retorna `meses` últimos meses incluindo o atual.
 */
export function fluxoCaixa(filtro: EmpresaFiltro, meses: number): {
  filtro: string;
  meses: number;
  snapshot_at: string | null;
  serie: { mes: string; entradas: number; saidas: number; saldo: number }[];
} {
  const { clause: empresaClause, params: empresaParams } = empresaToSqlClause(filtro);
  const empresaWhere = empresaClause ? ` AND ${empresaClause}` : "";

  const sql = `
    SELECT
      strftime('%Y-%m', DHBAIXA) AS mes,
      COALESCE(SUM(CASE WHEN RECDESP =  1 THEN VLRBAIXA ELSE 0 END), 0) AS entradas,
      COALESCE(SUM(CASE WHEN RECDESP = -1 THEN VLRBAIXA ELSE 0 END), 0) AS saidas
    FROM titulos
    WHERE DHBAIXA IS NOT NULL
      AND DHBAIXA >= ?
      AND DHBAIXA <  ?
      ${empresaWhere}
    GROUP BY mes
    ORDER BY mes
  `;

  const now = new Date();
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = addMonths(currentMonth, -(meses - 1));
  const end = addMonths(currentMonth, 1);

  const rows = getDb().prepare(sql).all(isoDate(start), isoDate(end), ...empresaParams) as {
    mes: string;
    entradas: number;
    saidas: number;
  }[];

  const serie = rows.map((r) => ({
    mes: r.mes,
    entradas: round2(r.entradas),
    saidas: round2(r.saidas),
    saldo: round2(r.entradas - r.saidas),
  }));

  return {
    filtro: describeFiltro(filtro),
    meses,
    snapshot_at: snapshotTitulosAt(),
    serie,
  };
}

/**
 * Distribuição das despesas realizadas no período, agrupadas pelas categorias
 * derivadas do prefixo do CODNAT. Útil para gráfico de pizza/donut.
 */
export function distribuicaoDespesas(filtro: EmpresaFiltro, periodo: Periodo, intervalo: IntervaloDatas = {}): {
  filtro: string;
  periodo: string;
  total: number;
  snapshot_at: string | null;
  categorias: { categoria: string; valor: number; percentual: number }[];
} {
  const { clause: empresaClause, params: empresaParams } = empresaToSqlClause(filtro);
  const empresaWhere = empresaClause ? ` AND ${empresaClause}` : "";
  const periodoWhere = periodoClause(periodo, "DTNEG", intervalo);
  const periodoWhereParams = periodoParams(periodo, intervalo);

  // Só categorias 2,3,4,5 entram em "despesa operacional"
  const sql = `
    SELECT
      SUBSTR(CAST(COALESCE(CODNAT, 0) AS TEXT), 1, 1) AS prefixo,
      COALESCE(SUM(VLRDESDOB), 0) AS valor
    FROM titulos
    WHERE ${periodoWhere}
      AND PROVISAO = 'N'
      AND RECDESP = -1
      AND SUBSTR(CAST(COALESCE(CODNAT, 0) AS TEXT), 1, 1) IN ('2','3','4','5')
      ${empresaWhere}
    GROUP BY prefixo
    ORDER BY valor DESC
  `;

  const rows = getDb().prepare(sql).all(...periodoWhereParams, ...empresaParams) as {
    prefixo: string;
    valor: number;
  }[];

  const total = rows.reduce((acc, r) => acc + r.valor, 0);

  const labels: Record<string, string> = {
    "2": CATEGORIAS_NAT.custos.label,
    "3": CATEGORIAS_NAT.despesas_admin.label,
    "4": CATEGORIAS_NAT.despesas_comerciais.label,
    "5": CATEGORIAS_NAT.impostos.label,
  };

  const categorias = rows.map((r) => ({
    categoria: labels[r.prefixo] ?? `Prefixo ${r.prefixo}`,
    valor: round2(r.valor),
    percentual: total > 0 ? round2((r.valor / total) * 100) : 0,
  }));

  return {
    filtro: describeFiltro(filtro),
    periodo: describePeriodo(periodo, intervalo),
    total: round2(total),
    snapshot_at: snapshotTitulosAt(),
    categorias,
  };
}

/**
 * Listagem de contas a receber/pagar EM ABERTO (não baixadas, realizadas).
 * Substitui a leitura direta do Sankhya nos endpoints /api/receber e /api/pagar.
 */
export function listarContasAbertas(args: {
  filtro: EmpresaFiltro;
  tipo: "receber" | "pagar";
  page: number;
  pageSize: number;
}): {
  filtro: string;
  tipo: string;
  page: number;
  pageSize: number;
  total: number;
  valor_total_aberto: number;
  snapshot_at: string | null;
  titulos: {
    NUFIN: number;
    CODEMP: number;
    CODPARC: number;
    NOMEPARC: string | null;
    CODTIPTIT: number | null;
    DESCRTIPTIT: string | null;
    CODNAT: number | null;
    DESCRNAT: string | null;
    DTNEG: string | null;
    DTVENC: string | null;
    valor_aberto: number;
    dias_atraso: number;
  }[];
} {
  const filtro = args.filtro;
  const tipo = args.tipo;
  const recdesp = tipo === "receber" ? 1 : -1;
  const page = Math.max(0, args.page);
  const pageSize = Math.min(Math.max(1, args.pageSize), 200);
  const offset = page * pageSize;

  const { clause: empresaClause, params: empresaParams } = empresaToSqlClause(filtro, "t.CODEMP");
  const empresaWhere = empresaClause ? ` AND ${empresaClause}` : "";

  const where = `t.RECDESP = ? AND t.PROVISAO = 'N' AND t.is_em_aberto = 1${empresaWhere}`;
  const baseParams = [recdesp, ...empresaParams];

  const totalRow = getDb()
    .prepare(`SELECT COUNT(*) AS qt, COALESCE(SUM(t.valor_aberto), 0) AS soma FROM titulos t WHERE ${where}`)
    .get(...baseParams) as { qt: number; soma: number };

  const rows = getDb()
    .prepare(
      `SELECT
         t.NUFIN, t.CODEMP, t.CODPARC,
         NULL AS NOMEPARC,
         t.CODTIPTIT,
         tt.DESCRTIPTIT,
         t.CODNAT,
         n.DESCRNAT,
         t.DTNEG,
         t.DTVENC,
         t.valor_aberto,
         CASE
           WHEN t.DTVENC IS NULL THEN 0
           WHEN date(t.DTVENC) < date('now') THEN CAST(julianday('now') - julianday(t.DTVENC) AS INTEGER)
           ELSE 0
         END AS dias_atraso
       FROM titulos t
       LEFT JOIN tipos_titulo tt ON tt.CODTIPTIT = t.CODTIPTIT
       LEFT JOIN naturezas n     ON n.CODNAT     = t.CODNAT
       WHERE ${where}
       ORDER BY date(t.DTVENC) ASC NULLS LAST, t.NUFIN ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...baseParams, pageSize, offset) as Array<{
      NUFIN: number;
      CODEMP: number;
      CODPARC: number;
      NOMEPARC: string | null;
      CODTIPTIT: number | null;
      DESCRTIPTIT: string | null;
      CODNAT: number | null;
      DESCRNAT: string | null;
      DTNEG: string | null;
      DTVENC: string | null;
      valor_aberto: number;
      dias_atraso: number;
    }>;

  return {
    filtro: describeFiltro(filtro),
    tipo,
    page,
    pageSize,
    total: totalRow.qt,
    valor_total_aberto: round2(totalRow.soma),
    snapshot_at: snapshotTitulosAt(),
    titulos: rows.map((r) => ({ ...r, valor_aberto: round2(r.valor_aberto) })),
  };
}

export function resumoContasAbertas(
  filtro: EmpresaFiltro,
  tipo: "receber" | "pagar",
): ContasAbertasResumo {
  const recdesp = tipo === "receber" ? 1 : -1;
  const { clause: empresaClause, params: empresaParams } = empresaToSqlClause(filtro, "CODEMP");
  const empresaWhere = empresaClause ? ` AND ${empresaClause}` : "";

  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS qt, COALESCE(SUM(valor_aberto), 0) AS soma
       FROM titulos
       WHERE RECDESP = ?
         AND PROVISAO = 'N'
         AND is_em_aberto = 1${empresaWhere}`,
    )
    .get(recdesp, ...empresaParams) as { qt: number; soma: number };

  return {
    filtro: describeFiltro(filtro),
    tipo,
    total: row.qt,
    valor_total_aberto: round2(row.soma),
    snapshot_at: snapshotTitulosAt(),
  };
}

export function financeiroResumo(
  filtro: EmpresaFiltro,
  periodo: Periodo,
  intervalo: IntervaloDatas = {},
  fluxoMeses = 12,
): FinanceiroResumo {
  return {
    dre: dre(filtro, periodo, intervalo),
    distribuicao_despesas: distribuicaoDespesas(filtro, periodo, intervalo),
    fluxo_caixa: fluxoCaixa(filtro, fluxoMeses),
    contas_receber: resumoContasAbertas(filtro, "receber"),
  };
}
