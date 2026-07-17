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
  codProj?: number[];
};

type Dre = {
  filtro: string;
  periodo: string;
  codProj?: number[];
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

export type DrePorProjetoLinha = Dre & {
  codproj: number;
  nome: string;
  CODPROJ: number;
  CODPROJPAI: number | null;
  IDENTIFICACAO: string | null;
  DESCRPROJ: string | null;
};

export type DrePorProjeto = {
  filtro: string;
  periodo: string;
  grupo: string;
  snapshot_at: string | null;
  projetos: DrePorProjetoLinha[];
  consolidado: Omit<Dre, "filtro" | "periodo" | "codProj" | "snapshot_at">;
};

export type RateioDiagnosticoItem = {
  nufin: number;
  codemp: number;
  empresa: string | null;
  codcencus: number | null;
  centro_resultado: string | null;
  codnat: number | null;
  natureza: string | null;
  codproj: number | null;
  valor: number;
  valor_baixado: number;
  valor_aberto: number;
  data: string | null;
  vencimento: string | null;
  baixa: string | null;
  em_aberto: boolean;
  tipo: string;
  parceiro: string | null;
  projeto: string | null;
  status: "COM_RATEIO" | "SEM_RATEIO" | "RATEIO_INCOMPLETO";
  total_perc?: number;
  percentual_valido?: number;
  valor_sem_projeto?: number;
  alerta?: string;
  distribuicao?: Array<{
    codproj: number | null;
    projeto?: string | null;
    percentual: number;
    valor: number;
  }>;
};

export type RateioProjetoResumo = {
  codproj: number;
  projeto: string;
  despesas: number;
  linhas: number;
  valor_rateado: number;
  percentual: number;
};

export type RateioDiagnostico = {
  status: "OK" | "RATEIO_NAO_SINCRONIZADO";
  mensagem?: string;
  periodo: { dataInicio: string; dataFim: string };
  resumo: {
    total_titulos: number;
    com_rateio_ok: number;
    sem_rateio: number;
    rateio_incompleto: number;
    valor_sem_rateio: number;
    valor_rateio_incompleto: number;
    titulos_sem_projeto: number;
    valor_sem_projeto: number;
    valor_rateado_total: number;
  };
  com_rateio: RateioDiagnosticoItem[];
  com_rateio_page: {
    page: number;
    pageSize: number;
    total: number;
  };
  sem_rateio: RateioDiagnosticoItem[];
  rateio_incompleto: RateioDiagnosticoItem[];
  rateio_por_projeto: RateioProjetoResumo[];
  snapshot_at: string | null;
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

function describeFiltroDre(filtro: EmpresaFiltro, codProj?: number[]): string {
  const empresa = describeFiltro(filtro);
  return codProj && codProj.length > 0
    ? `${empresa};projeto=lista[${codProj.join(",")}]`
    : empresa;
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

function normalizedCodProj(codProj?: number[]): number[] {
  return [...new Set((codProj ?? []).filter((n) => Number.isInteger(n) && n > 0))];
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

function valorTituloRateadoExpr(): string {
  return "CASE WHEN r.NUFIN IS NOT NULL THEN COALESCE(r.PERCRATEIO, 0) * t.VLRDESDOB / 100.0 ELSE t.VLRDESDOB END";
}

function somaTitulosRateadosPorProjeto(args: {
  filtro: EmpresaFiltro;
  periodo: Periodo;
  intervalo: IntervaloDatas;
  recdesp: 1 | -1;
  prefixo: string;
}): number {
  const codProj = normalizedCodProj(args.intervalo.codProj);
  if (codProj.length === 0) return 0;

  const empresa = empresaToSqlClause(args.filtro, "t.CODEMP");
  const empresaWhere = empresa.clause ? ` AND ${empresa.clause}` : "";
  const projetoWhere = ` AND COALESCE(r.CODPROJ, t.CODPROJ) IN (${placeholders(codProj)})`;
  const periodoWhere = periodoClause(args.periodo, "t.DTNEG", args.intervalo);

  const sql = `
    SELECT COALESCE(SUM(${valorTituloRateadoExpr()}), 0) AS total
    FROM titulos t
    LEFT JOIN titulos_rateio r ON r.NUFIN = t.NUFIN
    WHERE ${periodoWhere}
      AND t.PROVISAO = 'N'
      AND t.RECDESP = ?
      AND CAST(COALESCE(t.CODNAT, 0) AS TEXT) LIKE ?
      ${empresaWhere}
      ${projetoWhere}
  `;

  const row = getDb()
    .prepare(sql)
    .get(
      ...periodoParams(args.periodo, args.intervalo),
      args.recdesp,
      `${args.prefixo}%`,
      ...empresa.params,
      ...codProj,
    ) as { total: number };

  return row.total;
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
  const codProj = normalizedCodProj(intervalo.codProj);
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
  let receita_bruta: number;
  let custos: number;
  let despesas_admin: number;
  let despesas_comerciais: number;
  let impostos: number;

  if (codProj.length > 0) {
    const somaProjeto = (recdesp: 1 | -1, prefixo: string) =>
      somaTitulosRateadosPorProjeto({ filtro, periodo, intervalo: { ...intervalo, codProj }, recdesp, prefixo });

    receita_bruta = somaProjeto(1, "1");
    custos = somaProjeto(-1, "2");
    despesas_admin = somaProjeto(-1, "3");
    despesas_comerciais = somaProjeto(-1, "4");
    impostos = somaProjeto(-1, "5");
  } else {
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

    receita_bruta = (db
      .prepare(receitaSql)
      .get(...periodoWhereParams, ...pedidoEmpresa.params) as { total: number }).total;
    custos = (db.prepare(somaSql(-1, "2")).get(...periodoWhereParams, ...empresaParams) as { total: number }).total;
    despesas_admin = (db.prepare(somaSql(-1, "3")).get(...periodoWhereParams, ...empresaParams) as { total: number }).total;
    despesas_comerciais = (db.prepare(somaSql(-1, "4")).get(...periodoWhereParams, ...empresaParams) as { total: number }).total;
    impostos = (db.prepare(somaSql(-1, "5")).get(...periodoWhereParams, ...empresaParams) as { total: number }).total;
  }

  const despesas_total = custos + despesas_admin + despesas_comerciais + impostos;
  const resultado_operacional = receita_bruta - despesas_total;
  const margem_pct = receita_bruta > 0 ? (resultado_operacional / receita_bruta) * 100 : 0;

  return {
    filtro: describeFiltroDre(filtro, codProj),
    periodo: describePeriodo(periodo, intervalo),
    ...(codProj.length > 0 ? { codProj } : {}),
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

export function drePorProjeto(
  filtro: EmpresaFiltro,
  periodo: Periodo,
  intervalo: IntervaloDatas = {},
): DrePorProjeto {
  const empresaTitulos = empresaToSqlClause(filtro, "t.CODEMP");
  const empresaTitulosWhere = empresaTitulos.clause ? ` AND ${empresaTitulos.clause}` : "";
  const empresaPedidos = empresaToSqlClause(filtro, "p.CODEMP");
  const empresaPedidosWhere = empresaPedidos.clause ? ` AND ${empresaPedidos.clause}` : "";
  const codProj = normalizedCodProj(intervalo.codProj);
  const projetoWhere = (alias: string) => codProj.length > 0
    ? `${alias}.CODPROJ IN (${placeholders(codProj)})`
    : `${alias}.CODPROJ >= 40000000 AND ${alias}.CODPROJ < 50000000`;

  const sql = `
    WITH despesas_base AS (
      SELECT
        COALESCE(r.CODPROJ, t.CODPROJ) AS CODPROJ,
        t.RECDESP,
        t.CODNAT,
        ${valorTituloRateadoExpr()} AS valor
      FROM titulos t
      LEFT JOIN titulos_rateio r ON r.NUFIN = t.NUFIN
      WHERE ${periodoClause(periodo, "t.DTNEG", intervalo)}
        AND t.PROVISAO = 'N'
        AND t.RECDESP = -1
        AND COALESCE(r.CODPROJ, t.CODPROJ) IS NOT NULL
        ${empresaTitulosWhere}
    ),
    despesas_por_projeto AS (
      SELECT
        CODPROJ,
        COALESCE(SUM(CASE WHEN CAST(COALESCE(CODNAT, 0) AS TEXT) LIKE '2%' THEN valor ELSE 0 END), 0) AS custos,
        COALESCE(SUM(CASE WHEN CAST(COALESCE(CODNAT, 0) AS TEXT) LIKE '3%' THEN valor ELSE 0 END), 0) AS despesas_admin,
        COALESCE(SUM(CASE WHEN CAST(COALESCE(CODNAT, 0) AS TEXT) LIKE '4%' THEN valor ELSE 0 END), 0) AS despesas_comerciais,
        COALESCE(SUM(CASE WHEN CAST(COALESCE(CODNAT, 0) AS TEXT) LIKE '5%' THEN valor ELSE 0 END), 0) AS impostos
      FROM despesas_base
      GROUP BY CODPROJ
    ),
    receitas_por_projeto AS (
      SELECT p.CODPROJ, COALESCE(SUM(p.VLRNOTA), 0) AS receita_bruta
      FROM pedidos p
      WHERE ${periodoClause(periodo, "p.DTFATUR", intervalo)}
        AND p.STATUSNOTA = 'L'
        AND p.DTFATUR IS NOT NULL
        AND ${inListClause("p.CODTIPOPER", FATURAMENTO_TOPS)}
        AND p.CODPROJ IS NOT NULL
        ${empresaPedidosWhere}
      GROUP BY p.CODPROJ
    ),
    projetos_alvo AS (
      SELECT p.CODPROJ, p.CODPROJPAI, p.IDENTIFICACAO, p.DESCRPROJ
      FROM projetos p
      WHERE ${projetoWhere("p")}

      UNION

      SELECT d.CODPROJ, p.CODPROJPAI, p.IDENTIFICACAO, p.DESCRPROJ
      FROM despesas_por_projeto d
      LEFT JOIN projetos p ON p.CODPROJ = d.CODPROJ
      WHERE ${projetoWhere("d")}

      UNION

      SELECT r.CODPROJ, p.CODPROJPAI, p.IDENTIFICACAO, p.DESCRPROJ
      FROM receitas_por_projeto r
      LEFT JOIN projetos p ON p.CODPROJ = r.CODPROJ
      WHERE ${projetoWhere("r")}
    )
    SELECT
      p.CODPROJ,
      p.CODPROJPAI,
      p.IDENTIFICACAO,
      p.DESCRPROJ,
      COALESCE(r.receita_bruta, 0) AS receita_bruta,
      COALESCE(d.custos, 0) AS custos,
      COALESCE(d.despesas_admin, 0) AS despesas_admin,
      COALESCE(d.despesas_comerciais, 0) AS despesas_comerciais,
      COALESCE(d.impostos, 0) AS impostos
    FROM projetos_alvo p
    LEFT JOIN receitas_por_projeto r ON r.CODPROJ = p.CODPROJ
    LEFT JOIN despesas_por_projeto d ON d.CODPROJ = p.CODPROJ
    ORDER BY p.CODPROJ ASC
  `;

  const rows = getDb()
    .prepare(sql)
    .all(
      ...periodoParams(periodo, intervalo),
      ...empresaTitulos.params,
      ...periodoParams(periodo, intervalo),
      ...empresaPedidos.params,
      ...codProj,
      ...codProj,
      ...codProj,
    ) as Array<{
      CODPROJ: number;
      CODPROJPAI: number | null;
      IDENTIFICACAO: string | null;
      DESCRPROJ: string | null;
      receita_bruta: number;
      custos: number;
      despesas_admin: number;
      despesas_comerciais: number;
      impostos: number;
    }>;

  const snapshot_at = snapshotTitulosAt();
  const projetos = rows.map((row) => {
    const despesas_total = row.custos + row.despesas_admin + row.despesas_comerciais + row.impostos;
    const resultado_operacional = row.receita_bruta - despesas_total;
    const margem_pct = row.receita_bruta > 0 ? (resultado_operacional / row.receita_bruta) * 100 : 0;

    return {
      filtro: describeFiltroDre(filtro, [row.CODPROJ]),
      periodo: describePeriodo(periodo, intervalo),
      codProj: [row.CODPROJ],
      codproj: row.CODPROJ,
      nome: row.DESCRPROJ ?? row.IDENTIFICACAO ?? `Projeto ${row.CODPROJ}`,
      CODPROJ: row.CODPROJ,
      CODPROJPAI: row.CODPROJPAI,
      IDENTIFICACAO: row.IDENTIFICACAO,
      DESCRPROJ: row.DESCRPROJ,
      receita_bruta: round2(row.receita_bruta),
      custos: round2(row.custos),
      despesas_admin: round2(row.despesas_admin),
      despesas_comerciais: round2(row.despesas_comerciais),
      impostos: round2(row.impostos),
      despesas_total: round2(despesas_total),
      resultado_operacional: round2(resultado_operacional),
      margem_pct: round2(margem_pct),
      snapshot_at,
    };
  });

  const consolidadoBase = projetos.reduce(
    (acc, projeto) => ({
      receita_bruta: acc.receita_bruta + projeto.receita_bruta,
      custos: acc.custos + projeto.custos,
      despesas_admin: acc.despesas_admin + projeto.despesas_admin,
      despesas_comerciais: acc.despesas_comerciais + projeto.despesas_comerciais,
      impostos: acc.impostos + projeto.impostos,
    }),
    { receita_bruta: 0, custos: 0, despesas_admin: 0, despesas_comerciais: 0, impostos: 0 },
  );
  const despesas_total = consolidadoBase.custos + consolidadoBase.despesas_admin
    + consolidadoBase.despesas_comerciais + consolidadoBase.impostos;
  const resultado_operacional = consolidadoBase.receita_bruta - despesas_total;

  return {
    filtro: describeFiltroDre(filtro, codProj),
    periodo: describePeriodo(periodo, intervalo),
    grupo: codProj.length > 0 ? `lista[${codProj.join(",")}]` : "04",
    snapshot_at,
    projetos,
    consolidado: {
      receita_bruta: round2(consolidadoBase.receita_bruta),
      custos: round2(consolidadoBase.custos),
      despesas_admin: round2(consolidadoBase.despesas_admin),
      despesas_comerciais: round2(consolidadoBase.despesas_comerciais),
      impostos: round2(consolidadoBase.impostos),
      despesas_total: round2(despesas_total),
      resultado_operacional: round2(resultado_operacional),
      margem_pct: consolidadoBase.receita_bruta > 0
        ? round2((resultado_operacional / consolidadoBase.receita_bruta) * 100)
        : 0,
    },
  };
}

/**
 * Fluxo de caixa por mês (regime de caixa: usa DHBAIXA).
 * Retorna `meses` últimos meses incluindo o atual.
 */
export function fluxoCaixa(
  filtro: EmpresaFiltro,
  meses: number,
  escopo: { dataInicio?: string; dataFim?: string; codProj?: number[] } = {},
): {
  filtro: string;
  meses: number;
  snapshot_at: string | null;
  serie: { mes: string; entradas: number; saidas: number; saldo: number }[];
} {
  const { clause: empresaClause, params: empresaParams } = empresaToSqlClause(filtro);
  const empresaWhere = empresaClause ? ` AND ${empresaClause}` : "";
  const projetoWhere = escopo.codProj?.length
    ? ` AND CODPROJ IN (${escopo.codProj.map(() => "?").join(", ")})`
    : "";

  const sql = `
    SELECT
      strftime('%Y-%m', DHBAIXA) AS mes,
      COALESCE(SUM(CASE WHEN RECDESP =  1 THEN VLRBAIXA ELSE 0 END), 0) AS entradas,
      COALESCE(SUM(CASE WHEN RECDESP = -1 THEN VLRBAIXA ELSE 0 END), 0) AS saidas
    FROM titulos
    WHERE DHBAIXA IS NOT NULL
      AND DHBAIXA >= ?
      AND DHBAIXA <  ?
      ${empresaWhere}${projetoWhere}
    GROUP BY mes
    ORDER BY mes
  `;

  const now = new Date();
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = escopo.dataInicio ? new Date(`${escopo.dataInicio}T00:00:00.000Z`) : addMonths(currentMonth, -(meses - 1));
  const end = escopo.dataFim ? new Date(`${escopo.dataFim}T00:00:00.000Z`) : addMonths(currentMonth, 1);
  if (escopo.dataFim) end.setUTCDate(end.getUTCDate() + 1);

  const rows = getDb().prepare(sql).all(isoDate(start), isoDate(end), ...empresaParams, ...(escopo.codProj ?? [])) as {
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

export function listarRateio(args: { dataInicio: string; dataFim: string; codEmp?: number | null }) {
  const db = getDb();
  const { dataInicio, dataFim, codEmp } = args;
  const empresaWhere = codEmp ? `AND t.CODEMP = ${Number(codEmp)}` : "";

  const sql = `
    SELECT
      e.NOMEFANTASIA AS NOMEEMP,
      t.DHBAIXA AS DATA_BAIXA,
      COALESCE(t.VLRBAIXA,0) AS VALOR_BAIXADO,
      t.DTVENC AS DATA_VENC,
      CASE WHEN t.RECDESP = 1 THEN 'receber' WHEN t.RECDESP = -1 THEN 'pagar' ELSE '' END AS TIPOMOV,
      p.NOMEPARC,
      'SEM DESCRIÇÃO' AS HISTORICO,
      t.NUFIN AS NUMDOC,
      t.VLRDESDOB AS VLR_DOCUMENTO,
      r.CODPROJ AS CODPROJ,
      r.PERCRATEIO AS PERCRATEIO,
      ROUND(r.PERCRATEIO * t.VLRDESDOB / 100.0, 2) AS VALOR_RATEADO,
      t.CODCENCUS AS CODCR,
      cr.DESCRCENCUS AS DESCCR,
      t.CODNAT AS CODNAT,
      n.DESCRNAT AS DESCNAT
    FROM titulos t
    INNER JOIN titulos_rateio r ON r.NUFIN = t.NUFIN
    LEFT JOIN parceiros p ON p.CODPARC = t.CODPARC
    LEFT JOIN empresas e ON e.CODEMP = t.CODEMP
    LEFT JOIN naturezas n ON n.CODNAT = t.CODNAT
    LEFT JOIN centros_resultado cr ON cr.CODCENCUS = t.CODCENCUS
    WHERE t.DHBAIXA >= ? AND t.DHBAIXA <= ?
      AND t.DHBAIXA IS NOT NULL
      AND t.RECDESP = -1
      ${empresaWhere}
    ORDER BY t.DHBAIXA ASC
  `;

  const rows = db.prepare(sql).all(dataInicio, dataFim) as Array<Record<string, unknown>>;
  return { rows, snapshot_at: snapshotTitulosAt() };
}

export function rateioDiagnostico(args: {
  dataInicio: string;
  dataFim: string;
  codEmp?: number | null;
  codProj?: number[];
  page?: number;
  pageSize?: number;
}): RateioDiagnostico {
  const db = getDb();
  const { dataInicio, dataFim, codEmp, codProj } = args;
  const projetoIds = normalizedCodProj(codProj);
  const comRateioPage = Math.max(0, Math.trunc(args.page ?? 0));
  const comRateioPageSize = Math.min(100, Math.max(1, Math.trunc(args.pageSize ?? 20)));
  const empresaWhere = codEmp ? " AND t.CODEMP = ?" : "";
  const params = codEmp ? [dataInicio, dataFim, codEmp] : [dataInicio, dataFim];
  const periodoWhere = `t.DTNEG >= ? AND t.DTNEG < date(?, '+1 day')
    AND t.PROVISAO = 'N'
    AND t.RECDESP = -1${empresaWhere}`;
  const projetoPlaceholders = placeholders(projetoIds);

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM titulos t
    WHERE ${periodoWhere}
  `).get(...params) as { total: number };

  const rateioDisponivel = (db.prepare("SELECT COUNT(*) AS total FROM titulos_rateio").get() as { total: number }).total > 0;
  if (!rateioDisponivel) {
    return {
      status: "RATEIO_NAO_SINCRONIZADO",
      mensagem: "A base de rateio ainda nao possui registros sincronizados; os titulos nao foram classificados para evitar falso diagnostico.",
      periodo: { dataInicio, dataFim },
      resumo: {
        total_titulos: totalRow.total,
        com_rateio_ok: 0,
        sem_rateio: 0,
        rateio_incompleto: 0,
        valor_sem_rateio: 0,
        valor_rateio_incompleto: 0,
        titulos_sem_projeto: 0,
        valor_sem_projeto: 0,
        valor_rateado_total: 0,
      },
      com_rateio: [],
      com_rateio_page: { page: comRateioPage, pageSize: comRateioPageSize, total: 0 },
      sem_rateio: [],
      rateio_incompleto: [],
      rateio_por_projeto: [],
      snapshot_at: snapshotTitulosAt(),
    };
  }

  const semRateioRows = db.prepare(`
    SELECT
      t.NUFIN,
      t.CODEMP,
      t.CODPROJ,
      t.CODCENCUS,
      t.CODNAT,
      t.VLRDESDOB,
      t.VLRBAIXA,
      t.valor_aberto,
      t.is_em_aberto,
      t.DTNEG,
      t.DTVENC,
      t.DHBAIXA,
      t.tipo,
      p.NOMEPARC,
      pr.DESCRPROJ,
      e.NOMEFANTASIA,
      cr.DESCRCENCUS,
      n.DESCRNAT
    FROM titulos t
    LEFT JOIN parceiros p ON p.CODPARC = t.CODPARC
    LEFT JOIN projetos pr ON pr.CODPROJ = t.CODPROJ
    LEFT JOIN empresas e ON e.CODEMP = t.CODEMP
    LEFT JOIN centros_resultado cr ON cr.CODCENCUS = t.CODCENCUS
    LEFT JOIN naturezas n ON n.CODNAT = t.CODNAT
    WHERE ${periodoWhere}
      AND NOT EXISTS (SELECT 1 FROM titulos_rateio r WHERE r.NUFIN = t.NUFIN)
    ORDER BY ABS(t.VLRDESDOB) DESC, t.NUFIN ASC
  `).all(...params) as Array<{
    NUFIN: number;
    CODEMP: number;
    CODPROJ: number | null;
    CODCENCUS: number | null;
    CODNAT: number | null;
    VLRDESDOB: number;
    VLRBAIXA: number;
    valor_aberto: number;
    is_em_aberto: number;
    DTNEG: string | null;
    DTVENC: string | null;
    DHBAIXA: string | null;
    tipo: string;
    NOMEPARC: string | null;
    DESCRPROJ: string | null;
    NOMEFANTASIA: string | null;
    DESCRCENCUS: string | null;
    DESCRNAT: string | null;
  }>;

  const rateioRows = db.prepare(`
    SELECT
      t.NUFIN,
      t.CODEMP,
      t.CODPROJ AS TITULO_CODPROJ,
      t.CODCENCUS,
      t.CODNAT,
      t.VLRDESDOB,
      t.VLRBAIXA,
      t.valor_aberto,
      t.is_em_aberto,
      t.DTNEG,
      t.DTVENC,
      t.DHBAIXA,
      t.tipo,
      p.NOMEPARC,
      e.NOMEFANTASIA,
      cr.DESCRCENCUS,
      n.DESCRNAT,
      r.CODPROJ,
      r.PERCRATEIO,
      pr.DESCRPROJ
    FROM titulos t
    INNER JOIN titulos_rateio r ON r.NUFIN = t.NUFIN
    LEFT JOIN parceiros p ON p.CODPARC = t.CODPARC
    LEFT JOIN empresas e ON e.CODEMP = t.CODEMP
    LEFT JOIN centros_resultado cr ON cr.CODCENCUS = t.CODCENCUS
    LEFT JOIN naturezas n ON n.CODNAT = t.CODNAT
    LEFT JOIN projetos pr ON pr.CODPROJ = r.CODPROJ
    WHERE ${periodoWhere}
    ORDER BY t.NUFIN ASC, r.CODPROJ ASC
  `).all(...params) as Array<{
    NUFIN: number;
    CODEMP: number;
    TITULO_CODPROJ: number | null;
    CODCENCUS: number | null;
    CODNAT: number | null;
    VLRDESDOB: number;
    VLRBAIXA: number;
    valor_aberto: number;
    is_em_aberto: number;
    DTNEG: string | null;
    DTVENC: string | null;
    DHBAIXA: string | null;
    tipo: string;
    NOMEPARC: string | null;
    NOMEFANTASIA: string | null;
    DESCRCENCUS: string | null;
    DESCRNAT: string | null;
    CODPROJ: number | null;
    PERCRATEIO: number;
    DESCRPROJ: string | null;
  }>;

  const rateioProjetoRows = db.prepare(`
    SELECT
      r.CODPROJ AS codproj,
      COALESCE(pr.DESCRPROJ, pr.IDENTIFICACAO, 'Projeto ' || r.CODPROJ) AS projeto,
      COUNT(DISTINCT t.NUFIN) AS despesas,
      COUNT(*) AS linhas,
      COALESCE(SUM(r.PERCRATEIO * t.VLRDESDOB / 100.0), 0) AS valor_rateado
    FROM titulos t
    INNER JOIN titulos_rateio r ON r.NUFIN = t.NUFIN
    LEFT JOIN projetos pr ON pr.CODPROJ = r.CODPROJ
    WHERE ${periodoWhere}
      AND r.CODPROJ IS NOT NULL
      AND r.CODPROJ > 0
      AND r.PERCRATEIO > 0
      ${projetoIds.length > 0 ? `AND r.CODPROJ IN (${projetoPlaceholders})` : ""}
    GROUP BY r.CODPROJ, COALESCE(pr.DESCRPROJ, pr.IDENTIFICACAO, 'Projeto ' || r.CODPROJ)
    ORDER BY valor_rateado DESC, r.CODPROJ ASC
  `).all(
    ...params,
    ...projetoIds,
  ) as Array<{
    codproj: number;
    projeto: string;
    despesas: number;
    linhas: number;
    valor_rateado: number;
  }>;

  const agrupados = new Map<number, typeof rateioRows>();
  for (const row of rateioRows) {
    const grupo = agrupados.get(row.NUFIN) ?? [];
    grupo.push(row);
    agrupados.set(row.NUFIN, grupo);
  }

  let comRateioOk = 0;
  const comRateioItens: RateioDiagnosticoItem[] = [];
  const rateioIncompleto: RateioDiagnosticoItem[] = [];
  let titulosSemProjeto = 0;
  let valorSemProjeto = 0;
  for (const rows of agrupados.values()) {
    const first = rows[0];
    const percentual = (row: (typeof rows)[number]) => Number(row.PERCRATEIO) || 0;
    const temProjetoValido = (row: (typeof rows)[number]) => Number(row.CODPROJ) > 0;
    const totalPerc = rows.reduce((sum, row) => sum + percentual(row), 0);
    const percentualValido = rows
      .filter((row) => temProjetoValido(row) && percentual(row) > 0)
      .reduce((sum, row) => sum + percentual(row), 0);
    const percentualSemProjeto = rows
      .filter((row) => !temProjetoValido(row))
      .reduce((sum, row) => sum + Math.max(percentual(row), 0), 0);
    const projetosValidos = rows.filter((row) => temProjetoValido(row) && percentual(row) > 0);
    const distribuicao = rows.map((row) => ({
      codproj: row.CODPROJ,
      projeto: row.DESCRPROJ ?? (Number(row.CODPROJ) > 0 ? `Projeto ${row.CODPROJ}` : "Sem projeto"),
      percentual: round2(percentual(row)),
      valor: round2((percentual(row) * first.VLRDESDOB) / 100),
    }));
    const valorDoSemProjeto = round2((percentualSemProjeto * first.VLRDESDOB) / 100);
    if (valorDoSemProjeto > 0.01) {
      titulosSemProjeto += 1;
      valorSemProjeto += valorDoSemProjeto;
    }

    const somaInvalida = Math.abs(totalPerc - 100) > 0.01;
    const percentualValidoInvalido = Math.abs(percentualValido - 100) > 0.01;
    if (!somaInvalida && !percentualValidoInvalido) {
      comRateioOk += 1;
      comRateioItens.push({
        nufin: first.NUFIN,
        codemp: first.CODEMP,
        empresa: first.NOMEFANTASIA,
        codcencus: first.CODCENCUS,
        centro_resultado: first.DESCRCENCUS,
        codnat: first.CODNAT,
        natureza: first.DESCRNAT,
        codproj: projetosValidos.length === 1 ? projetosValidos[0].CODPROJ : null,
        valor: round2(first.VLRDESDOB),
        valor_baixado: round2(first.VLRBAIXA),
        valor_aberto: round2(first.valor_aberto),
        data: first.DTNEG,
        vencimento: first.DTVENC,
        baixa: first.DHBAIXA,
        em_aberto: first.is_em_aberto === 1,
        tipo: first.tipo,
        parceiro: first.NOMEPARC,
        projeto: projetosValidos.length === 1
          ? (projetosValidos[0].DESCRPROJ ?? `Projeto ${projetosValidos[0].CODPROJ}`)
          : `${projetosValidos.length} projetos`,
        status: "COM_RATEIO",
        total_perc: round2(totalPerc),
        percentual_valido: round2(percentualValido),
        distribuicao: distribuicao.filter((row) => Number(row.codproj) > 0 && row.percentual > 0),
      });
      continue;
    }

    const alertas: string[] = [];
    if (somaInvalida) alertas.push(`Soma do rateio: ${round2(totalPerc)}%`);
    if (percentualSemProjeto > 0.01) alertas.push(`${round2(percentualSemProjeto)}% sem projeto`);
    if (alertas.length === 0) alertas.push(`Percentual valido: ${round2(percentualValido)}%`);
    rateioIncompleto.push({
      nufin: first.NUFIN,
      codemp: first.CODEMP,
      empresa: first.NOMEFANTASIA,
      codcencus: first.CODCENCUS,
      centro_resultado: first.DESCRCENCUS,
      codnat: first.CODNAT,
      natureza: first.DESCRNAT,
      codproj: first.TITULO_CODPROJ,
      valor: round2(first.VLRDESDOB),
      valor_baixado: round2(first.VLRBAIXA),
      valor_aberto: round2(first.valor_aberto),
      data: first.DTNEG,
      vencimento: first.DTVENC,
      baixa: first.DHBAIXA,
      em_aberto: first.is_em_aberto === 1,
      tipo: first.tipo,
      parceiro: first.NOMEPARC,
      projeto: projetosValidos.length === 1 ? projetosValidos[0].DESCRPROJ : "Multiplos projetos",
      status: "RATEIO_INCOMPLETO",
      total_perc: round2(totalPerc),
      percentual_valido: round2(percentualValido),
      valor_sem_projeto: valorDoSemProjeto,
      alerta: alertas.join("; "),
      distribuicao,
    });
  }
  const projetoIdSet = new Set(projetoIds);
  const comRateioFiltrado = projetoIds.length > 0
    ? comRateioItens.filter((item) => item.distribuicao?.some((row) => row.codproj != null && projetoIdSet.has(row.codproj)))
    : comRateioItens;
  comRateioFiltrado.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  const comRateioOffset = comRateioPage * comRateioPageSize;
  const comRateio = comRateioFiltrado.slice(comRateioOffset, comRateioOffset + comRateioPageSize);
  rateioIncompleto.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));

  const valorRateadoTotal = rateioProjetoRows.reduce((sum, row) => sum + Number(row.valor_rateado || 0), 0);
  const rateioPorProjeto: RateioProjetoResumo[] = rateioProjetoRows.map((row) => ({
    codproj: row.codproj,
    projeto: row.projeto,
    despesas: row.despesas,
    linhas: row.linhas,
    valor_rateado: round2(row.valor_rateado),
    percentual: valorRateadoTotal > 0 ? round2((row.valor_rateado / valorRateadoTotal) * 100) : 0,
  }));

  const semRateio: RateioDiagnosticoItem[] = semRateioRows.map((row) => ({
    nufin: row.NUFIN,
    codemp: row.CODEMP,
    empresa: row.NOMEFANTASIA,
    codcencus: row.CODCENCUS,
    centro_resultado: row.DESCRCENCUS,
    codnat: row.CODNAT,
    natureza: row.DESCRNAT,
    codproj: row.CODPROJ,
    valor: round2(row.VLRDESDOB),
    valor_baixado: round2(row.VLRBAIXA),
    valor_aberto: round2(row.valor_aberto),
    data: row.DTNEG,
    vencimento: row.DTVENC,
    baixa: row.DHBAIXA,
    em_aberto: row.is_em_aberto === 1,
    tipo: row.tipo,
    parceiro: row.NOMEPARC,
    projeto: row.DESCRPROJ,
    status: "SEM_RATEIO",
  }));

  return {
    status: "OK",
    periodo: { dataInicio, dataFim },
    resumo: {
      total_titulos: totalRow.total,
      com_rateio_ok: comRateioOk,
      sem_rateio: semRateio.length,
      rateio_incompleto: rateioIncompleto.length,
      valor_sem_rateio: round2(semRateio.reduce((sum, row) => sum + row.valor, 0)),
      valor_rateio_incompleto: round2(rateioIncompleto.reduce((sum, row) => sum + row.valor, 0)),
      titulos_sem_projeto: titulosSemProjeto,
      valor_sem_projeto: round2(valorSemProjeto),
      valor_rateado_total: round2(valorRateadoTotal),
    },
    com_rateio: comRateio,
    com_rateio_page: {
      page: comRateioPage,
      pageSize: comRateioPageSize,
      total: comRateioFiltrado.length,
    },
    sem_rateio: semRateio,
    rateio_incompleto: rateioIncompleto,
    rateio_por_projeto: rateioPorProjeto,
    snapshot_at: snapshotTitulosAt(),
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
  dataInicio?: string;
  dataFim?: string;
  codProj?: number[];
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
    CODCENCUS: number | null;
    CODPROJ: number | null;
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
  const projetoWhere = args.codProj?.length
    ? ` AND t.CODPROJ IN (${args.codProj.map(() => "?").join(", ")})`
    : "";
  const periodoWhere = args.dataInicio && args.dataFim
    ? " AND date(t.DTNEG) >= date(?) AND date(t.DTNEG) <= date(?)"
    : "";

  const where = `t.RECDESP = ? AND t.PROVISAO = 'N' AND t.is_em_aberto = 1${empresaWhere}${projetoWhere}${periodoWhere}`;
  const baseParams = [recdesp, ...empresaParams, ...(args.codProj ?? []), ...(args.dataInicio && args.dataFim ? [args.dataInicio, args.dataFim] : [])];

  const totalRow = getDb()
    .prepare(`SELECT COUNT(*) AS qt, COALESCE(SUM(t.valor_aberto), 0) AS soma FROM titulos t WHERE ${where}`)
    .get(...baseParams) as { qt: number; soma: number };

  const rows = getDb()
    .prepare(
      `SELECT
         t.NUFIN, t.CODEMP, t.CODPARC,
         p.NOMEPARC,
         t.CODCENCUS,
         t.CODPROJ,
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
       LEFT JOIN parceiros p ON p.CODPARC = t.CODPARC
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
      CODCENCUS: number | null;
      CODPROJ: number | null;
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

export function listarProjetos(): {
  CODPROJ: number;
  CODPROJPAI: number | null;
  GRAU: number | null;
  ANALITICO: string | null;
  IDENTIFICACAO: string | null;
  DESCRPROJ: string | null;
  ativo: number;
}[] {
  return getDb()
    .prepare(
      `WITH codigos AS (
         SELECT DISTINCT CODPROJ FROM pedidos WHERE CODPROJ IS NOT NULL
         UNION
         SELECT DISTINCT CODPROJ FROM titulos WHERE CODPROJ IS NOT NULL
         UNION
         SELECT DISTINCT CODPROJ FROM titulos_rateio WHERE CODPROJ IS NOT NULL
       )
       SELECT
         c.CODPROJ,
         p.CODPROJPAI,
         p.GRAU,
         p.ANALITICO,
         COALESCE(NULLIF(p.IDENTIFICACAO, ''), 'Projeto ' || c.CODPROJ) AS IDENTIFICACAO,
         COALESCE(NULLIF(p.DESCRPROJ, ''), 'Projeto ' || c.CODPROJ) AS DESCRPROJ,
         COALESCE(p.ativo, 1) AS ativo
       FROM codigos c
       LEFT JOIN projetos p ON p.CODPROJ = c.CODPROJ
       ORDER BY c.CODPROJ ASC`,
    )
    .all() as {
      CODPROJ: number;
      CODPROJPAI: number | null;
      GRAU: number | null;
      ANALITICO: string | null;
      IDENTIFICACAO: string | null;
      DESCRPROJ: string | null;
      ativo: number;
    }[];
}

export function listarCentrosResultado(): { CODCENCUS: number; DESCRCENCUS: string; ativo: number }[] {
  return getDb()
    .prepare(
      `SELECT CODCENCUS, DESCRCENCUS, ativo
       FROM centros_resultado
       ORDER BY CODCENCUS ASC`,
    )
    .all() as { CODCENCUS: number; DESCRCENCUS: string; ativo: number }[];
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
