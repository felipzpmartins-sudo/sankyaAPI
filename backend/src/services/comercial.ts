import { getDb } from "../db/connection.js";
import { type EmpresaFiltro, empresaToSqlClause } from "../utils/empresa.js";
import { type VendedorFiltro, vendedorToSqlClause } from "../utils/vendedor.js";
import { FATURAMENTO_TOPS, PEDIDO_VENDA_TOPS, inListClause } from "./operacoes.js";

/**
 * Telas comerciais (vendedores e produtos).
 *
 * Duas diferenças em relação às telas financeiras, e elas são o motivo desta
 * separação:
 *
 * 1. A ótica é o PEDIDO, não a nota. O comercial quer saber o que o vendedor
 *    vendeu, e a venda existe no momento do pedido — a nota vem depois, às
 *    vezes dias depois, às vezes nunca.
 * 2. O corte por produto exige a tabela de itens, que passou a ser
 *    sincronizada junto com estas telas.
 */

export type PeriodoComercial = { dataInicio: string; dataFim: string };

/** Janela do snapshot. Antes disso o painel simplesmente não tem histórico. */
const INICIO_DO_HISTORICO = "2025-01-01";

/**
 * Pedido de venda na TGFCAB. TIPMOV 'P' cobre também orçamento, comodato,
 * bonificação e remessas, por isso o corte é pela lista de TOPs de venda.
 */
const PEDIDO_DE_VENDA = `p.TIPMOV = 'P' AND ${inListClause("p.CODTIPOPER", PEDIDO_VENDA_TOPS)}`;

/**
 * Item que conta como produto vendido. Nota de kit traz o conjunto e os
 * componentes desmembrados (USOPROD 'D'); a soma dos componentes repete o
 * valor do conjunto, então eles ficam de fora de qualquer soma de valor.
 */
const ITEM_VENDIDO = "COALESCE(i.USOPROD, '') <> 'D'";

/** Valor do item líquido do desconto de item, como entra no VLRNOTA. */
const VALOR_ITEM = "(i.VLRTOT - i.VLRDESC)";

/**
 * Pendente pelo critério do Sankhya (TGFCAB.PENDENTE). Enquanto o snapshot
 * não tiver a coluna preenchida, cai no critério antigo: sem nota = pendente.
 */
const PENDENTE = "COALESCE(p.PENDENTE, CASE WHEN v.NUNOTA_NOTA IS NULL THEN 'S' ELSE 'N' END) = 'S'";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

type Filtros = {
  empresa: EmpresaFiltro;
  vendedor: VendedorFiltro;
  periodo: PeriodoComercial;
};

/**
 * Cláusulas comuns. `dataFim` é inclusivo na API e vira exclusivo aqui, para
 * que o último dia do período não fique de fora por causa de hora.
 */
function base(filtros: Filtros, alias: string): { where: string; params: unknown[] } {
  const p = alias ? `${alias}.` : "";
  const empresa = empresaToSqlClause(filtros.empresa, `${p}CODEMP`);
  const vendedor = vendedorToSqlClause(filtros.vendedor, `${p}CODVEND`);
  const partes = [
    `${p}DTNEG >= date(?)`,
    `${p}DTNEG <= date(?)`,
    ...(empresa.clause ? [empresa.clause] : []),
    ...(vendedor.clause ? [vendedor.clause] : []),
  ];
  return {
    where: partes.join(" AND "),
    params: [
      filtros.periodo.dataInicio,
      filtros.periodo.dataFim,
      ...empresa.params,
      ...vendedor.params,
    ],
  };
}

/** Primeiro vínculo de cada pedido com uma nota de verdade (ver sync/vinculos). */
const VINCULO = `LEFT JOIN (SELECT NUNOTA_PEDIDO, MIN(NUNOTA_NOTA) AS NUNOTA_NOTA
                  FROM pedido_nota GROUP BY NUNOTA_PEDIDO) v
              ON v.NUNOTA_PEDIDO = p.NUNOTA`;

/**
 * Pedidos de venda x nota emitida.
 *
 * Três situações, a mesma divisão que o Sankhya faz:
 * - "com nota": tem ao menos uma nota emitida a partir dele;
 * - "pendente": TGFCAB.PENDENTE = 'S', ainda há saldo a faturar. Inclui o
 *   pedido parcialmente faturado, que tem nota e continua pendente;
 * - "sem nota": pendente e sem nenhuma nota.
 *
 * Pedido cancelado (STATUSNOTA 'C') não conta — ele não vai virar nota e
 * ficaria envelhecendo na lista para sempre.
 */
export function pedidosVsNota(args: Filtros & { limite?: number }): {
  periodo: PeriodoComercial;
  total_pedidos: number;
  com_nota: number;
  sem_nota: number;
  pendentes: number;
  parciais: number;
  valor_total: number;
  valor_sem_nota: number;
  valor_pendente: number;
  pedidos: Array<{
    NUNOTA: number;
    NUMNOTA: number | null;
    CODEMP: number;
    parceiro: string | null;
    vendedor: string | null;
    valor: number;
    DTNEG: string | null;
    nota: number | null;
    DTFATUR: string | null;
    dias_em_aberto: number | null;
    parcial: boolean;
  }>;
} {
  const { where, params } = base(args, "p");
  const limite = Math.min(Math.max(1, args.limite ?? 200), 500);

  const resumo = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COUNT(v.NUNOTA_NOTA) AS com_nota,
         COALESCE(SUM(CASE WHEN ${PENDENTE} THEN 1 ELSE 0 END), 0) AS pendentes,
         COALESCE(SUM(CASE WHEN ${PENDENTE} AND v.NUNOTA_NOTA IS NULL THEN 1 ELSE 0 END), 0) AS sem_nota,
         COALESCE(SUM(p.VLRNOTA), 0) AS valor_total,
         COALESCE(SUM(CASE WHEN ${PENDENTE} THEN p.VLRNOTA ELSE 0 END), 0) AS valor_pendente,
         COALESCE(SUM(CASE WHEN ${PENDENTE} AND v.NUNOTA_NOTA IS NULL THEN p.VLRNOTA ELSE 0 END), 0) AS valor_sem_nota
       FROM pedidos p
       ${VINCULO}
       WHERE ${PEDIDO_DE_VENDA}
         AND COALESCE(p.STATUSNOTA, '') <> 'C'
         AND ${where}`,
    )
    .get(...params) as {
      total: number;
      com_nota: number;
      pendentes: number;
      sem_nota: number;
      valor_total: number;
      valor_pendente: number;
      valor_sem_nota: number;
    };

  // Só os pendentes: é a lista que o comercial cobra. Os sem nota primeiro,
  // depois os parciais, cada grupo do mais antigo para o mais novo.
  const pedidos = getDb()
    .prepare(
      `SELECT
         p.NUNOTA, p.NUMNOTA, p.CODEMP,
         pa.NOMEPARC AS parceiro,
         ve.APELIDO  AS vendedor,
         p.VLRNOTA   AS valor,
         p.DTNEG,
         v.NUNOTA_NOTA AS nota,
         n.DTFATUR,
         CAST(julianday('now') - julianday(p.DTNEG) AS INTEGER) AS dias_em_aberto,
         (v.NUNOTA_NOTA IS NOT NULL) AS parcial
       FROM pedidos p
       ${VINCULO}
       LEFT JOIN pedidos    n  ON n.NUNOTA   = v.NUNOTA_NOTA
       LEFT JOIN parceiros  pa ON pa.CODPARC = p.CODPARC
       LEFT JOIN vendedores ve ON ve.CODVEND = p.CODVEND
       WHERE ${PEDIDO_DE_VENDA}
         AND COALESCE(p.STATUSNOTA, '') <> 'C'
         AND ${PENDENTE}
         AND ${where}
       ORDER BY (v.NUNOTA_NOTA IS NOT NULL), p.DTNEG ASC, p.NUNOTA ASC
       LIMIT ?`,
    )
    .all(...params, limite) as Array<{
      NUNOTA: number;
      NUMNOTA: number | null;
      CODEMP: number;
      parceiro: string | null;
      vendedor: string | null;
      valor: number;
      DTNEG: string | null;
      nota: number | null;
      DTFATUR: string | null;
      dias_em_aberto: number | null;
      parcial: number;
    }>;

  return {
    periodo: args.periodo,
    total_pedidos: resumo.total,
    com_nota: resumo.com_nota,
    sem_nota: resumo.sem_nota,
    pendentes: resumo.pendentes,
    parciais: resumo.pendentes - resumo.sem_nota,
    valor_total: round2(resumo.valor_total),
    valor_sem_nota: round2(resumo.valor_sem_nota),
    valor_pendente: round2(resumo.valor_pendente),
    pedidos: pedidos.map((r) => ({ ...r, valor: round2(r.valor), parcial: r.parcial === 1 })),
  };
}

export type SituacaoPedido = "faturado" | "parcial" | "sem_nota" | "encerrado";
export type FiltroListaPedidos = "todos" | "com_nota" | "pendentes";

/** Teto da lista de detalhe. Um ano inteiro da Maker fica bem abaixo disso. */
const LIMITE_LISTA_PEDIDOS = 5_000;

/**
 * Lista de detalhe por trás dos cartões da tela Comercial. Usa exatamente o
 * mesmo corte do `pedidosVsNota`, então a contagem de cada filtro bate com o
 * número do cartão:
 * - "todos": cartão "Pedidos de venda";
 * - "com_nota": cartão "Viraram nota" (inclui o parcial, que já tem nota);
 * - "pendentes": cartão "Pendentes no Sankhya".
 */
export function listarPedidos(args: Filtros & { situacao: FiltroListaPedidos }): {
  periodo: PeriodoComercial;
  situacao: FiltroListaPedidos;
  total: number;
  valor_total: number;
  truncado: boolean;
  pedidos: Array<{
    NUNOTA: number;
    parceiro: string | null;
    vendedor: string | null;
    valor: number;
    DTNEG: string | null;
    nota: number | null;
    numero_nota: number | null;
    DTFATUR: string | null;
    situacao: SituacaoPedido;
  }>;
} {
  const { where, params } = base(args, "p");
  const filtro =
    args.situacao === "com_nota"
      ? "AND v.NUNOTA_NOTA IS NOT NULL"
      : args.situacao === "pendentes"
        ? `AND ${PENDENTE}`
        : "";

  const rows = getDb()
    .prepare(
      `SELECT
         p.NUNOTA,
         pa.NOMEPARC AS parceiro,
         ve.APELIDO  AS vendedor,
         p.VLRNOTA   AS valor,
         p.DTNEG,
         v.NUNOTA_NOTA AS nota,
         n.NUMNOTA     AS numero_nota,
         n.DTFATUR,
         CASE
           WHEN ${PENDENTE} AND v.NUNOTA_NOTA IS NULL THEN 'sem_nota'
           WHEN ${PENDENTE} THEN 'parcial'
           WHEN v.NUNOTA_NOTA IS NOT NULL THEN 'faturado'
           ELSE 'encerrado'
         END AS situacao
       FROM pedidos p
       ${VINCULO}
       LEFT JOIN pedidos    n  ON n.NUNOTA   = v.NUNOTA_NOTA
       LEFT JOIN parceiros  pa ON pa.CODPARC = p.CODPARC
       LEFT JOIN vendedores ve ON ve.CODVEND = p.CODVEND
       WHERE ${PEDIDO_DE_VENDA}
         AND COALESCE(p.STATUSNOTA, '') <> 'C'
         ${filtro}
         AND ${where}
       ORDER BY p.DTNEG DESC, p.NUNOTA DESC`,
    )
    .all(...params) as Array<{
      NUNOTA: number;
      parceiro: string | null;
      vendedor: string | null;
      valor: number;
      DTNEG: string | null;
      nota: number | null;
      numero_nota: number | null;
      DTFATUR: string | null;
      situacao: SituacaoPedido;
    }>;

  const valorTotal = rows.reduce((soma, r) => soma + (r.valor ?? 0), 0);
  return {
    periodo: args.periodo,
    situacao: args.situacao,
    total: rows.length,
    valor_total: round2(valorTotal),
    truncado: rows.length > LIMITE_LISTA_PEDIDOS,
    pedidos: rows.slice(0, LIMITE_LISTA_PEDIDOS).map((r) => ({ ...r, valor: round2(r.valor ?? 0) })),
  };
}

/** Comparação entre vendedores pela ótica do pedido. */
export function rankingVendedores(args: Filtros): {
  periodo: PeriodoComercial;
  total: number;
  vendedores: Array<{
    CODVEND: number;
    vendedor: string;
    pedidos: number;
    valor: number;
    ticket_medio: number;
    participacao_pct: number;
  }>;
} {
  const { where, params } = base(args, "p");

  const rows = getDb()
    .prepare(
      `SELECT
         COALESCE(p.CODVEND, 0) AS CODVEND,
         COALESCE(v.APELIDO, 'Sem vendedor') AS vendedor,
         COUNT(*) AS pedidos,
         COALESCE(SUM(p.VLRNOTA), 0) AS valor
       FROM pedidos p
       LEFT JOIN vendedores v ON v.CODVEND = p.CODVEND
       WHERE ${PEDIDO_DE_VENDA}
         AND COALESCE(p.STATUSNOTA, '') <> 'C'
         AND ${where}
       GROUP BY COALESCE(p.CODVEND, 0), COALESCE(v.APELIDO, 'Sem vendedor')
       ORDER BY valor DESC, CODVEND ASC`,
    )
    .all(...params) as Array<{
      CODVEND: number;
      vendedor: string;
      pedidos: number;
      valor: number;
    }>;

  const total = rows.reduce((soma, r) => soma + r.valor, 0);

  return {
    periodo: args.periodo,
    total: round2(total),
    vendedores: rows.map((r) => ({
      CODVEND: r.CODVEND,
      vendedor: r.vendedor,
      pedidos: r.pedidos,
      valor: round2(r.valor),
      ticket_medio: r.pedidos > 0 ? round2(r.valor / r.pedidos) : 0,
      participacao_pct: total > 0 ? round2((r.valor / total) * 100) : 0,
    })),
  };
}

/**
 * Faturamento por produto no período, a base das telas de produto.
 *
 * Sai da NOTA faturada, não do pedido: curva ABC é classificação de receita
 * realizada, e é assim que o financeiro confere o número.
 *
 * Valor = VLRTOT - VLRDESC do item, sem os componentes de kit. Assim a soma
 * fecha com o VLRNOTA das mesmas notas menos o frete (conferido contra o
 * Sankhya em 2026-11-05: antes passava R$ 342 mil por conta dos kits em
 * dobro e R$ 36 mil por ignorar o desconto).
 */
function faturamentoPorProduto(args: {
  empresa: EmpresaFiltro;
  vendedor: VendedorFiltro;
  periodo: PeriodoComercial;
}): Array<{ CODPROD: number; produto: string; grupo: string | null; qtd: number; valor: number }> {
  const empresa = empresaToSqlClause(args.empresa, "p.CODEMP");
  const vendedor = vendedorToSqlClause(args.vendedor, "p.CODVEND");
  const extras = [empresa.clause, vendedor.clause].filter(Boolean).map((c) => ` AND ${c}`).join("");

  return getDb()
    .prepare(
      `SELECT
         i.CODPROD,
         COALESCE(pr.DESCRPROD, 'Produto ' || i.CODPROD) AS produto,
         pr.GRUPO_DESCR AS grupo,
         COALESCE(SUM(i.QTDNEG), 0) AS qtd,
         COALESCE(SUM(${VALOR_ITEM}), 0) AS valor
       FROM pedido_itens i
       INNER JOIN pedidos p ON p.NUNOTA = i.NUNOTA
       LEFT JOIN produtos pr ON pr.CODPROD = i.CODPROD
       WHERE ${inListClause("p.CODTIPOPER", FATURAMENTO_TOPS)}
         AND p.STATUSNOTA = 'L'
         AND p.DTFATUR IS NOT NULL
         AND ${ITEM_VENDIDO}
         AND p.DTFATUR >= date(?) AND p.DTFATUR <= date(?)${extras}
       GROUP BY i.CODPROD, pr.DESCRPROD, pr.GRUPO_DESCR
       HAVING SUM(${VALOR_ITEM}) > 0
       ORDER BY valor DESC, i.CODPROD ASC`,
    )
    .all(
      args.periodo.dataInicio,
      args.periodo.dataFim,
      ...empresa.params,
      ...vendedor.params,
    ) as Array<{
      CODPROD: number;
      produto: string;
      grupo: string | null;
      qtd: number;
      valor: number;
    }>;
}

/** Corte da curva: A até 80% do acumulado, B até 95%, C o resto. */
const CORTE_A = 80;
const CORTE_B = 95;

export function curvaAbc(args: Filtros): {
  periodo: PeriodoComercial;
  total: number;
  resumo: Array<{ curva: "A" | "B" | "C"; produtos: number; valor: number; participacao_pct: number }>;
  produtos: Array<{
    CODPROD: number;
    produto: string;
    grupo: string | null;
    qtd: number;
    valor: number;
    participacao_pct: number;
    acumulado_pct: number;
    curva: "A" | "B" | "C";
  }>;
} {
  const linhas = faturamentoPorProduto(args);
  const total = linhas.reduce((soma, r) => soma + r.valor, 0);

  let acumulado = 0;
  const produtos = linhas.map((r) => {
    const participacao = total > 0 ? (r.valor / total) * 100 : 0;
    acumulado += participacao;
    const curva: "A" | "B" | "C" =
      acumulado <= CORTE_A ? "A" : acumulado <= CORTE_B ? "B" : "C";
    return {
      CODPROD: r.CODPROD,
      produto: r.produto,
      grupo: r.grupo,
      qtd: round2(r.qtd),
      valor: round2(r.valor),
      participacao_pct: round2(participacao),
      acumulado_pct: round2(acumulado),
      curva,
    };
  });

  const resumo = (["A", "B", "C"] as const).map((curva) => {
    const doGrupo = produtos.filter((r) => r.curva === curva);
    const valor = doGrupo.reduce((soma, r) => soma + r.valor, 0);
    return {
      curva,
      produtos: doGrupo.length,
      valor: round2(valor),
      participacao_pct: total > 0 ? round2((valor / total) * 100) : 0,
    };
  });

  return { periodo: args.periodo, total: round2(total), resumo, produtos };
}

/** Top N mais e menos vendidos no período. */
export function rankingProdutos(args: Filtros & { limite?: number }): {
  periodo: PeriodoComercial;
  total: number;
  mais_vendidos: Array<{ CODPROD: number; produto: string; qtd: number; valor: number }>;
  menos_vendidos: Array<{ CODPROD: number; produto: string; qtd: number; valor: number }>;
} {
  const limite = Math.min(Math.max(1, args.limite ?? 10), 50);
  const linhas = faturamentoPorProduto(args);
  const total = linhas.reduce((soma, r) => soma + r.valor, 0);
  const enxuto = (r: (typeof linhas)[number]) => ({
    CODPROD: r.CODPROD,
    produto: r.produto,
    qtd: round2(r.qtd),
    valor: round2(r.valor),
  });

  return {
    periodo: args.periodo,
    total: round2(total),
    mais_vendidos: linhas.slice(0, limite).map(enxuto),
    // Só produtos que venderam alguma coisa. "Menos vendido" com zero seria a
    // lista do catálogo inteiro, que não responde nada. Empate desempata por
    // código, para a lista não mudar de ordem a cada consulta.
    menos_vendidos: [...linhas]
      .sort((a, b) => a.valor - b.valor || a.CODPROD - b.CODPROD)
      .slice(0, limite)
      .map(enxuto),
  };
}

/**
 * Quem mais vende um produto, ou uma curva inteira.
 *
 * Sem `codProd` nem `curva`, responde pelo catálogo todo — que é o mesmo
 * ranking de vendedores, só que por valor de item em vez de valor de pedido.
 */
export function vendedoresPorProduto(args: Filtros & {
  codProd?: number;
  curva?: "A" | "B" | "C";
}): {
  periodo: PeriodoComercial;
  filtro: { codProd: number | null; curva: "A" | "B" | "C" | null; produto: string | null };
  total: number;
  vendedores: Array<{
    CODVEND: number;
    vendedor: string;
    qtd: number;
    valor: number;
    participacao_pct: number;
  }>;
} {
  const empresa = empresaToSqlClause(args.empresa, "p.CODEMP");
  const vendedorFiltro = vendedorToSqlClause(args.vendedor, "p.CODVEND");

  // A curva é derivada do mesmo cálculo da tela de curva ABC, então filtrar
  // por curva é filtrar pela lista de produtos que ela classificou.
  let produtosDaCurva: number[] | null = null;
  if (args.curva) {
    produtosDaCurva = curvaAbc(args).produtos
      .filter((r) => r.curva === args.curva)
      .map((r) => r.CODPROD);
    if (produtosDaCurva.length === 0) {
      return {
        periodo: args.periodo,
        filtro: { codProd: args.codProd ?? null, curva: args.curva, produto: null },
        total: 0,
        vendedores: [],
      };
    }
  }

  const extras = [
    empresa.clause,
    vendedorFiltro.clause,
    ...(args.codProd != null ? ["i.CODPROD = ?"] : []),
    ...(produtosDaCurva ? [`i.CODPROD IN (${produtosDaCurva.map(() => "?").join(", ")})`] : []),
  ]
    .filter(Boolean)
    .map((c) => ` AND ${c}`)
    .join("");

  const rows = getDb()
    .prepare(
      `SELECT
         COALESCE(p.CODVEND, 0) AS CODVEND,
         COALESCE(v.APELIDO, 'Sem vendedor') AS vendedor,
         COALESCE(SUM(i.QTDNEG), 0) AS qtd,
         COALESCE(SUM(${VALOR_ITEM}), 0) AS valor
       FROM pedido_itens i
       INNER JOIN pedidos p ON p.NUNOTA = i.NUNOTA
       LEFT JOIN vendedores v ON v.CODVEND = p.CODVEND
       WHERE ${inListClause("p.CODTIPOPER", FATURAMENTO_TOPS)}
         AND p.STATUSNOTA = 'L'
         AND p.DTFATUR IS NOT NULL
         AND ${ITEM_VENDIDO}
         AND p.DTFATUR >= date(?) AND p.DTFATUR <= date(?)${extras}
       GROUP BY COALESCE(p.CODVEND, 0), COALESCE(v.APELIDO, 'Sem vendedor')
       ORDER BY valor DESC, CODVEND ASC`,
    )
    .all(
      args.periodo.dataInicio,
      args.periodo.dataFim,
      ...empresa.params,
      ...vendedorFiltro.params,
      ...(args.codProd != null ? [args.codProd] : []),
      ...(produtosDaCurva ?? []),
    ) as Array<{ CODVEND: number; vendedor: string; qtd: number; valor: number }>;

  const total = rows.reduce((soma, r) => soma + r.valor, 0);
  const produto = args.codProd == null
    ? null
    : (getDb()
        .prepare("SELECT DESCRPROD FROM produtos WHERE CODPROD = ?")
        .get(args.codProd) as { DESCRPROD: string } | undefined)?.DESCRPROD ?? null;

  return {
    periodo: args.periodo,
    filtro: { codProd: args.codProd ?? null, curva: args.curva ?? null, produto },
    total: round2(total),
    vendedores: rows.map((r) => ({
      CODVEND: r.CODVEND,
      vendedor: r.vendedor,
      qtd: round2(r.qtd),
      valor: round2(r.valor),
      participacao_pct: total > 0 ? round2((r.valor / total) * 100) : 0,
    })),
  };
}

/**
 * Produtos ativos que nao venderam no periodo.
 *
 * Tres cuidados que mudam o que o numero significa:
 *
 * 1. So produto ATIVO entra. TGFPRO.ATIVO ja vinha no sync desde sempre —
 *    sem esse corte a lista traria 1.923 produtos que a empresa nem vende
 *    mais, e o indicador viraria ruido.
 * 2. A ultima venda so enxerga o que esta no snapshot, que comeca em
 *    01/01/2025. Produto vendido pela ultima vez em 2024 aparece aqui como
 *    "nunca vendeu" — por isso a resposta separa quem parou de vender de
 *    quem nunca apareceu na janela.
 * 3. Estoque entra para separar catalogo morto de dinheiro parado. So conta
 *    o estoque PROPRIO em maos (TGFEST.TIPO 'P' sem parceiro): saldo com
 *    parceiro ou de terceiros (TIPO 'T') nao e mercadoria parada na casa.
 *
 * Aqui componente de kit (USOPROD 'D') conta como venda: ele saiu na nota, so
 * nao soma valor. Sem isso o material didatico vendido dentro do kit apareceria
 * como produto parado.
 */
export function produtosSemVenda(args: Filtros & { limite?: number }): {
  periodo: PeriodoComercial;
  inicio_do_historico: string;
  total_ativos: number;
  sem_venda: number;
  pararam_de_vender: number;
  nunca_na_janela: number;
  com_estoque: number;
  produtos: Array<{
    CODPROD: number;
    produto: string;
    grupo: string | null;
    estoque: number;
    ultima_venda: string | null;
    dias_sem_vender: number | null;
    parou_de_vender: boolean;
  }>;
} {
  const empresa = empresaToSqlClause(args.empresa, "p.CODEMP");
  const vendedor = vendedorToSqlClause(args.vendedor, "p.CODVEND");
  const extras = [empresa.clause, vendedor.clause]
    .filter(Boolean)
    .map((c) => ` AND ${c}`)
    .join("");
  const empresaEstoque = empresaToSqlClause(args.empresa, "CODEMP");
  const estoqueWhere =
    " WHERE COALESCE(NULLIF(TIPO, ''), 'P') = 'P' AND CODPARC = 0" +
    (empresaEstoque.clause ? ` AND ${empresaEstoque.clause}` : "");

  const faturado = `${inListClause("p.CODTIPOPER", FATURAMENTO_TOPS)}
      AND p.STATUSNOTA = 'L'
      AND p.DTFATUR IS NOT NULL`;

  const sql = `
    WITH vendas AS (
      SELECT i.CODPROD, MAX(p.DTFATUR) AS ultima
      FROM pedido_itens i
      INNER JOIN pedidos p ON p.NUNOTA = i.NUNOTA
      WHERE ${faturado}${extras}
      GROUP BY i.CODPROD
    ),
    no_periodo AS (
      SELECT DISTINCT i.CODPROD
      FROM pedido_itens i
      INNER JOIN pedidos p ON p.NUNOTA = i.NUNOTA
      WHERE ${faturado}${extras}
        AND p.DTFATUR >= date(?) AND p.DTFATUR <= date(?)
    ),
    estoque AS (
      SELECT CODPROD, SUM(ESTOQUE) AS qtd FROM produto_estoque${estoqueWhere} GROUP BY CODPROD
    )
    SELECT
      pr.CODPROD,
      pr.DESCRPROD AS produto,
      pr.GRUPO_DESCR AS grupo,
      COALESCE(e.qtd, 0) AS estoque,
      v.ultima AS ultima_venda,
      CASE WHEN v.ultima IS NULL THEN NULL
           ELSE CAST(julianday(?) - julianday(v.ultima) AS INTEGER) END AS dias_sem_vender
    FROM produtos pr
    LEFT JOIN vendas  v ON v.CODPROD = pr.CODPROD
    LEFT JOIN estoque e ON e.CODPROD = pr.CODPROD
    WHERE pr.ativo = 1
      AND pr.CODPROD NOT IN (SELECT CODPROD FROM no_periodo)
    ORDER BY (v.ultima IS NULL), v.ultima DESC, COALESCE(e.qtd, 0) DESC`;

  const params = [
    ...empresa.params, ...vendedor.params,          // vendas
    ...empresa.params, ...vendedor.params,          // no_periodo
    args.periodo.dataInicio, args.periodo.dataFim,  // no_periodo
    ...empresaEstoque.params,                       // estoque
    args.periodo.dataFim,                           // dias_sem_vender
  ];

  const linhas = getDb().prepare(sql).all(...params) as Array<{
    CODPROD: number;
    produto: string;
    grupo: string | null;
    estoque: number;
    ultima_venda: string | null;
    dias_sem_vender: number | null;
  }>;

  const totalAtivos = (getDb()
    .prepare("SELECT COUNT(*) AS qt FROM produtos WHERE ativo = 1")
    .get() as { qt: number }).qt;

  const produtos = linhas.map((r) => ({
    ...r,
    estoque: round2(r.estoque),
    parou_de_vender: r.ultima_venda != null,
  }));

  const limite = Math.min(Math.max(1, args.limite ?? 500), 3_000);

  return {
    periodo: args.periodo,
    inicio_do_historico: INICIO_DO_HISTORICO,
    total_ativos: totalAtivos,
    sem_venda: produtos.length,
    pararam_de_vender: produtos.filter((r) => r.parou_de_vender).length,
    nunca_na_janela: produtos.filter((r) => !r.parou_de_vender).length,
    com_estoque: produtos.filter((r) => r.estoque > 0).length,
    produtos: produtos.slice(0, limite),
  };
}
