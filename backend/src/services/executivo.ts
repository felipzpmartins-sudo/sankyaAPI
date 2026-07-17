import { getDb } from "../db/connection.js";
import { empresaToSqlClause, type EmpresaFiltro } from "../utils/empresa.js";
import { vendedorToSqlClause, type VendedorFiltro } from "../utils/vendedor.js";
import { FATURAMENTO_TOPS, inListClause } from "./operacoes.js";
import { fluxoCaixa, listarCentrosResultado, listarContasAbertas, listarProjetos } from "./dashboard-financeiro.js";

type Range = {
  dataInicio: string;
  dataFim: string;
};

export type ExecutivoResumo = {
  periodo: Range;
  snapshot_at: string | null;
  comercial: {
    fechado: { qtd: number; valor: number };
    negociacao: { qtd: number; valor: number };
    nota_venda: { qtd: number; valor: number };
    conversao_pct: number;
    por_projeto: Array<{
      codproj: number;
      nome: string;
      fechado: number;
      negociacao: number;
      nota_venda: number;
    }>;
    recentes: Array<{
      nunota: number;
      empresa: string;
      vendedor: string;
      projeto: string;
      status: string;
      data: string | null;
      valor: number;
    }>;
  };
  financeiro: {
    recebimentos: { qtd: number; valor: number };
    pagamentos: { qtd: number; valor: number };
    juros_antecipacoes: { qtd: number; valor: number };
    conta_receber_aberto: { qtd: number; valor: number };
    conta_pagar_aberto: { qtd: number; valor: number };
    vencidas: { qtd: number; valor: number };
    a_vencer: { qtd: number; valor: number };
    pagos_periodo_meses_anteriores: { qtd: number; valor: number };
    fluxo_caixa: ReturnType<typeof fluxoCaixa>["serie"];
    contas_receber: ReturnType<typeof listarContasAbertas>;
    contas_pagar: ReturnType<typeof listarContasAbertas>;
    movimentos: Array<{
      nufin: number;
      data_baixa: string | null;
      tipo: "receber" | "pagar";
      parceiro: string;
      natureza: string;
      projeto: string;
      centro: string;
      valor: number;
    }>;
  };
  referencias: {
    projetos: ReturnType<typeof listarProjetos>;
    centros_resultado: ReturnType<typeof listarCentrosResultado>;
  };
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function compareIso(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.localeCompare(b);
}

function defaultRange(): Range {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    dataInicio: start.toISOString().slice(0, 10),
    dataFim: now.toISOString().slice(0, 10),
  };
}

function makeRange(range?: Partial<Range>): [string, string] {
  const fallback = defaultRange();
  const dataInicio = range?.dataInicio ?? fallback.dataInicio;
  const dataFim = range?.dataFim ?? fallback.dataFim;
  const end = new Date(`${dataFim}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return [dataInicio, end.toISOString().slice(0, 10)];
}

function snapshotAt(values: Array<string | null | undefined>): string | null {
  const valid = values.filter((v): v is string => Boolean(v));
  if (valid.length === 0) return null;
  return valid.sort(compareIso).at(-1) ?? null;
}

function syncAt(entity: string): string | null {
  const row = getDb()
    .prepare("SELECT last_synced_at FROM sync_state WHERE entity = ?")
    .get(entity) as { last_synced_at: string | null } | undefined;
  return row?.last_synced_at ?? null;
}

export function executivoResumo(
  filtro: EmpresaFiltro,
  vendedor: VendedorFiltro = { modo: "todos" },
  range?: Partial<Range>,
  codProj: number[] = [],
): ExecutivoResumo {
  const db = getDb();
  const fallback = defaultRange();
  const dataFimInclusivo = range?.dataFim ?? fallback.dataFim;
  const [dataInicio, dataFimExclusivo] = makeRange(range);
  const empresaPedidos = empresaToSqlClause(filtro, "p.CODEMP");
  const empresaTitulos = empresaToSqlClause(filtro, "t.CODEMP");
  const vendedorSql = vendedorToSqlClause(vendedor, "p.CODVEND");
  const projetoWhere = codProj.length > 0 ? ` AND COALESCE(p.CODPROJ, 0) IN (${codProj.map(() => "?").join(", ")})` : "";
  const salesExtras = [empresaPedidos, vendedorSql].filter((item) => item.clause);
  const salesWhere = salesExtras.map((item) => ` AND ${item.clause}`).join("");
  const salesParams = salesExtras.flatMap((item) => item.params);
  const fluxo = fluxoCaixa(filtro, 12, { dataInicio, dataFim: dataFimInclusivo });

  const closed = db
    .prepare(
      `
      SELECT COUNT(*) AS qtd, COALESCE(SUM(VLRNOTA), 0) AS valor
      FROM pedidos p
      WHERE ${inListClause("p.CODTIPOPER", FATURAMENTO_TOPS)}
        AND p.STATUSNOTA = 'L'
        AND p.DTFATUR IS NOT NULL
        AND p.DTFATUR >= date(?) AND p.DTFATUR < date(?)
        ${salesWhere}
        ${projetoWhere}
      `,
    )
    .get(dataInicio, dataFimExclusivo, ...salesParams, ...codProj) as { qtd: number; valor: number };

  const negociacao = db
    .prepare(
      `
      SELECT COUNT(*) AS qtd, COALESCE(SUM(VLRNOTA), 0) AS valor
      FROM pedidos p
      WHERE ${inListClause("p.CODTIPOPER", FATURAMENTO_TOPS)}
        AND p.DTFATUR IS NULL
        AND p.DTNEG >= date(?) AND p.DTNEG < date(?)
        ${salesWhere}
        ${projetoWhere}
      `,
    )
    .get(dataInicio, dataFimExclusivo, ...salesParams, ...codProj) as { qtd: number; valor: number };

  const notasVenda = db
    .prepare(
      `
      SELECT COUNT(*) AS qtd, COALESCE(SUM(VLRNOTA), 0) AS valor
      FROM pedidos p
      WHERE ${inListClause("p.CODTIPOPER", FATURAMENTO_TOPS)}
        AND p.NUMNOTA IS NOT NULL
        AND p.DTFATUR IS NOT NULL
        AND p.DTFATUR >= date(?) AND p.DTFATUR < date(?)
        ${salesWhere}
        ${projetoWhere}
      `,
    )
    .get(dataInicio, dataFimExclusivo, ...salesParams, ...codProj) as { qtd: number; valor: number };

  const conversaoPct = closed.qtd > 0 ? (notasVenda.qtd / closed.qtd) * 100 : 0;

  const porProjeto = db
    .prepare(
      `
      SELECT
        COALESCE(p.CODPROJ, 0) AS codproj,
        COALESCE(pr.DESCRPROJ, pr.IDENTIFICACAO, 'Projeto ' || COALESCE(p.CODPROJ, 0)) AS nome,
        COALESCE(SUM(CASE WHEN p.STATUSNOTA = 'L' AND p.DTFATUR IS NOT NULL THEN p.VLRNOTA ELSE 0 END), 0) AS fechado,
        COALESCE(SUM(CASE WHEN p.DTFATUR IS NULL THEN p.VLRNOTA ELSE 0 END), 0) AS negociacao,
        COALESCE(SUM(CASE WHEN p.NUMNOTA IS NOT NULL AND p.DTFATUR IS NOT NULL THEN p.VLRNOTA ELSE 0 END), 0) AS nota_venda
      FROM pedidos p
      LEFT JOIN projetos pr ON pr.CODPROJ = p.CODPROJ
      WHERE ${inListClause("p.CODTIPOPER", FATURAMENTO_TOPS)}
        AND p.DTNEG >= date(?) AND p.DTNEG < date(?)
        ${salesWhere}
        ${projetoWhere}
      GROUP BY COALESCE(p.CODPROJ, 0), nome
      ORDER BY fechado DESC, nota_venda DESC
      LIMIT 12
      `,
    )
    .all(dataInicio, dataFimExclusivo, ...salesParams, ...codProj) as Array<{
      codproj: number;
      nome: string;
      fechado: number;
      negociacao: number;
      nota_venda: number;
    }>;

  const recentes = db
    .prepare(
      `
      SELECT
        p.NUNOTA,
        COALESCE(e.NOMEFANTASIA, '-') AS empresa,
        COALESCE(v.APELIDO, '-') AS vendedor,
        COALESCE(pr.DESCRPROJ, pr.IDENTIFICACAO, 'Projeto ' || COALESCE(p.CODPROJ, 0)) AS projeto,
        CASE
          WHEN p.DTFATUR IS NULL THEN 'Negociacao'
          WHEN p.NUMNOTA IS NOT NULL THEN 'Nota'
          ELSE 'Fechado'
        END AS status,
        p.DTFATUR AS data,
        p.VLRNOTA AS valor
      FROM pedidos p
      LEFT JOIN empresas e ON e.CODEMP = p.CODEMP
      LEFT JOIN vendedores v ON v.CODVEND = p.CODVEND
      LEFT JOIN projetos pr ON pr.CODPROJ = p.CODPROJ
      WHERE ${inListClause("p.CODTIPOPER", FATURAMENTO_TOPS)}
        AND p.DTNEG >= date(?) AND p.DTNEG < date(?)
        ${salesWhere}
        ${projetoWhere}
      ORDER BY COALESCE(p.DTFATUR, p.DTNEG) DESC, p.NUNOTA DESC
      LIMIT 10
      `,
    )
    .all(dataInicio, dataFimExclusivo, ...salesParams, ...codProj) as Array<{
      NUNOTA: number;
      empresa: string;
      vendedor: string;
      projeto: string;
      status: string;
      data: string | null;
      valor: number;
    }>;

  const resumoReceber = listarContasAbertas({
    filtro,
    tipo: "receber",
    page: 0,
    pageSize: 8,
  });
  const resumoPagar = listarContasAbertas({
    filtro,
    tipo: "pagar",
    page: 0,
    pageSize: 8,
  });

  const abertoTotals = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(CASE WHEN RECDESP = 1 AND is_em_aberto = 1 THEN valor_aberto ELSE 0 END), 0) AS receber_valor,
        COALESCE(SUM(CASE WHEN RECDESP = -1 AND is_em_aberto = 1 THEN valor_aberto ELSE 0 END), 0) AS pagar_valor,
        COALESCE(SUM(CASE WHEN RECDESP = 1 AND is_em_aberto = 1 AND date(DTVENC) < date('now') THEN 1 ELSE 0 END), 0) AS vencidas_qtd,
        COALESCE(SUM(CASE WHEN RECDESP = 1 AND is_em_aberto = 1 AND date(DTVENC) < date('now') THEN valor_aberto ELSE 0 END), 0) AS vencidas_valor,
        COALESCE(SUM(CASE WHEN RECDESP = 1 AND is_em_aberto = 1 AND date(DTVENC) >= date('now') THEN 1 ELSE 0 END), 0) AS a_vencer_qtd,
        COALESCE(SUM(CASE WHEN RECDESP = 1 AND is_em_aberto = 1 AND date(DTVENC) >= date('now') THEN valor_aberto ELSE 0 END), 0) AS a_vencer_valor
      FROM titulos t
      WHERE t.PROVISAO = 'N'
      ${empresaTitulos.clause ? ` AND ${empresaTitulos.clause}` : ""}
      ${codProj.length > 0 ? ` AND COALESCE(t.CODPROJ, 0) IN (${codProj.map(() => "?").join(", ")})` : ""}
      `,
    )
    .get(...empresaTitulos.params, ...codProj) as {
    receber_valor: number;
    pagar_valor: number;
    vencidas_qtd: number;
    vencidas_valor: number;
    a_vencer_qtd: number;
    a_vencer_valor: number;
  };

  const recebimentos = db
    .prepare(
      `
      SELECT COUNT(*) AS qtd, COALESCE(SUM(VLRBAIXA), 0) AS valor
      FROM titulos t
      WHERE t.RECDESP = 1
        AND t.DHBAIXA IS NOT NULL
        AND t.DHBAIXA >= date(?) AND t.DHBAIXA < date(?)
        ${empresaTitulos.clause ? ` AND ${empresaTitulos.clause}` : ""}
        ${codProj.length > 0 ? ` AND COALESCE(t.CODPROJ, 0) IN (${codProj.map(() => "?").join(", ")})` : ""}
      `,
    )
    .get(dataInicio, dataFimExclusivo, ...empresaTitulos.params, ...codProj) as { qtd: number; valor: number };

  const pagamentos = db
    .prepare(
      `
      SELECT COUNT(*) AS qtd, COALESCE(SUM(VLRBAIXA), 0) AS valor
      FROM titulos t
      WHERE t.RECDESP = -1
        AND t.DHBAIXA IS NOT NULL
        AND t.DHBAIXA >= date(?) AND t.DHBAIXA < date(?)
        ${empresaTitulos.clause ? ` AND ${empresaTitulos.clause}` : ""}
        ${codProj.length > 0 ? ` AND COALESCE(t.CODPROJ, 0) IN (${codProj.map(() => "?").join(", ")})` : ""}
      `,
    )
    .get(dataInicio, dataFimExclusivo, ...empresaTitulos.params, ...codProj) as { qtd: number; valor: number };

  const jurosAntecipacoes = db
    .prepare(
      `
      SELECT COUNT(*) AS qtd, COALESCE(SUM(VLRBAIXA), 0) AS valor
      FROM titulos t
      LEFT JOIN naturezas n ON n.CODNAT = t.CODNAT
      WHERE t.DHBAIXA IS NOT NULL
        AND t.DHBAIXA >= date(?) AND t.DHBAIXA < date(?)
        AND (${[
          "LOWER(COALESCE(n.DESCRNAT, '')) LIKE '%juros%'",
          "LOWER(COALESCE(n.DESCRNAT, '')) LIKE '%antecipa%'",
          "LOWER(COALESCE(n.DESCRNAT, '')) LIKE '%factoring%'",
        ].join(" OR ")})
        ${empresaTitulos.clause ? ` AND ${empresaTitulos.clause}` : ""}
        ${codProj.length > 0 ? ` AND COALESCE(t.CODPROJ, 0) IN (${codProj.map(() => "?").join(", ")})` : ""}
      `,
    )
    .get(dataInicio, dataFimExclusivo, ...empresaTitulos.params, ...codProj) as { qtd: number; valor: number };

  const pagosPeriodoMesesAnteriores = db
    .prepare(
      `
      SELECT COUNT(*) AS qtd, COALESCE(SUM(VLRBAIXA), 0) AS valor
      FROM titulos t
      WHERE t.DHBAIXA IS NOT NULL
        AND t.DHBAIXA >= date(?) AND t.DHBAIXA < date(?)
        AND date(t.DTVENC) < date(?)
        ${empresaTitulos.clause ? ` AND ${empresaTitulos.clause}` : ""}
        ${codProj.length > 0 ? ` AND COALESCE(t.CODPROJ, 0) IN (${codProj.map(() => "?").join(", ")})` : ""}
      `,
    )
    .get(dataInicio, dataFimExclusivo, dataInicio, ...empresaTitulos.params, ...codProj) as { qtd: number; valor: number };

  const movimentoRows = db
    .prepare(
      `
      SELECT
        t.NUFIN AS nufin,
        t.DHBAIXA AS data_baixa,
        CASE WHEN t.RECDESP = 1 THEN 'receber' ELSE 'pagar' END AS tipo,
        COALESCE(p.NOMEPARC, '-') AS parceiro,
        COALESCE(n.DESCRNAT, 'Sem natureza') AS natureza,
        COALESCE(pr.DESCRPROJ, pr.IDENTIFICACAO, 'Projeto ' || COALESCE(t.CODPROJ, 0)) AS projeto,
        COALESCE(cr.DESCRCENCUS, 'Sem centro') AS centro,
        COALESCE(t.VLRBAIXA, 0) AS valor
      FROM titulos t
      LEFT JOIN parceiros p ON p.CODPARC = t.CODPARC
      LEFT JOIN naturezas n ON n.CODNAT = t.CODNAT
      LEFT JOIN projetos pr ON pr.CODPROJ = COALESCE(t.CODPROJ, 0)
      LEFT JOIN centros_resultado cr ON cr.CODCENCUS = t.CODCENCUS
      WHERE t.DHBAIXA IS NOT NULL
        AND t.DHBAIXA >= date(?) AND t.DHBAIXA < date(?)
        ${empresaTitulos.clause ? ` AND ${empresaTitulos.clause}` : ""}
        ${codProj.length > 0 ? ` AND COALESCE(t.CODPROJ, 0) IN (${codProj.map(() => "?").join(", ")})` : ""}
      ORDER BY t.DHBAIXA DESC, t.NUFIN DESC
      LIMIT 15
      `,
    )
    .all(dataInicio, dataFimExclusivo, ...empresaTitulos.params, ...codProj) as Array<{
    nufin: number;
    data_baixa: string | null;
    tipo: "receber" | "pagar";
    parceiro: string;
    natureza: string;
    projeto: string;
    centro: string;
    valor: number;
  }>;

  return {
    periodo: { dataInicio, dataFim: dataFimInclusivo },
    snapshot_at: snapshotAt([
      syncAt("pedidos"),
      resumoReceber.snapshot_at,
      resumoPagar.snapshot_at,
      fluxo.snapshot_at,
    ]),
    comercial: {
      fechado: { qtd: closed.qtd, valor: round2(closed.valor) },
      negociacao: { qtd: negociacao.qtd, valor: round2(negociacao.valor) },
      nota_venda: { qtd: notasVenda.qtd, valor: round2(notasVenda.valor) },
      conversao_pct: round2(conversaoPct),
      por_projeto: porProjeto.map((row) => ({
        ...row,
        fechado: round2(row.fechado),
        negociacao: round2(row.negociacao),
        nota_venda: round2(row.nota_venda),
      })),
      recentes: recentes.map((row) => ({
        nunota: row.NUNOTA,
        empresa: row.empresa,
        vendedor: row.vendedor,
        projeto: row.projeto,
        status: row.status,
        data: row.data,
        valor: round2(row.valor),
      })),
    },
    financeiro: {
      recebimentos: { qtd: recebimentos.qtd, valor: round2(recebimentos.valor) },
      pagamentos: { qtd: pagamentos.qtd, valor: round2(pagamentos.valor) },
      juros_antecipacoes: { qtd: jurosAntecipacoes.qtd, valor: round2(jurosAntecipacoes.valor) },
      conta_receber_aberto: {
        qtd: resumoReceber.total,
        valor: round2(abertoTotals.receber_valor),
      },
      conta_pagar_aberto: {
        qtd: resumoPagar.total,
        valor: round2(abertoTotals.pagar_valor),
      },
      vencidas: {
        qtd: abertoTotals.vencidas_qtd,
        valor: round2(abertoTotals.vencidas_valor),
      },
      a_vencer: {
        qtd: abertoTotals.a_vencer_qtd,
        valor: round2(abertoTotals.a_vencer_valor),
      },
      pagos_periodo_meses_anteriores: {
        qtd: pagosPeriodoMesesAnteriores.qtd,
        valor: round2(pagosPeriodoMesesAnteriores.valor),
      },
      fluxo_caixa: fluxo.serie,
      contas_receber: resumoReceber,
      contas_pagar: resumoPagar,
      movimentos: movimentoRows.map((row) => ({
        ...row,
        valor: round2(row.valor),
      })),
    },
    referencias: {
      projetos: listarProjetos(),
      centros_resultado: listarCentrosResultado(),
    },
  };
}
