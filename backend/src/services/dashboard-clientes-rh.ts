import { getDb } from "../db/connection.js";
import { FATURAMENTO_TOPS, inListClause } from "./operacoes.js";

const WHERE_FATURAMENTO = `${inListClause("p.CODTIPOPER", FATURAMENTO_TOPS)} AND p.STATUSNOTA = 'L' AND p.DTFATUR IS NOT NULL`;

export type ClienteFluxoMes = {
  mes: string;
  novos: number;
  recorrentes: number;
  receita: number;
};

export type ClienteSegmento = {
  name: string;
  value: number;
  receita: number;
};

export type ClienteTop = {
  CODPARC: number;
  NOMEPARC: string;
  TIPPESSOA: string | null;
  cidade: string | null;
  uf: string | null;
  receita: number;
  pedidos: number;
  ticket_medio: number;
  ultima_compra: string | null;
  receber_aberto: number;
};

export type ClientesBI = {
  ano: string;
  snapshot_at: string | null;
  total_clientes: number;
  clientes_ativos: number;
  compradores_ano: number;
  receita_ano: number;
  ticket_medio: number;
  receber_aberto: number;
  receber_vencido: number;
  fluxo: ClienteFluxoMes[];
  segmentos: ClienteSegmento[];
  top_clientes: ClienteTop[];
};

export type RhEmpresaLinha = {
  CODEMP: number;
  NOMEFANTASIA: string;
  vendedores: number;
  faturamento: number;
};

export type RhRankingLinha = {
  CODVEND: number;
  APELIDO: string;
  ativo: 0 | 1;
  faturamento: number;
  pedidos: number;
  ticket_medio: number;
  ultima_venda: string | null;
};

export type RhMensalLinha = {
  mes: string;
  vendedores: number;
  pedidos: number;
  faturamento: number;
};

export type RhBI = {
  ano: string;
  snapshot_at: string | null;
  total_vendedores: number;
  vendedores_ativos: number;
  vendedores_com_venda: number;
  faturamento_ano: number;
  ticket_medio: number;
  media_por_vendedor_ativo: number;
  por_empresa: RhEmpresaLinha[];
  ranking: RhRankingLinha[];
  mensal: RhMensalLinha[];
};

function currentYear(): string {
  return String(new Date().getFullYear());
}

function snapshotPedidosAt(): string | null {
  const row = getDb()
    .prepare("SELECT last_synced_at FROM sync_state WHERE entity = 'pedidos'")
    .get() as { last_synced_at: string | null } | undefined;
  return row?.last_synced_at ?? null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clientesBI(): ClientesBI {
  const db = getDb();
  const ano = currentYear();

  const kpi = db
    .prepare(
      `WITH vendas_ano AS (
         SELECT CODPARC, COUNT(*) AS pedidos, SUM(VLRNOTA) AS receita
         FROM pedidos p
         WHERE ${WHERE_FATURAMENTO}
           AND strftime('%Y', p.DTFATUR) = ?
         GROUP BY CODPARC
       ),
       clientes_base AS (
         SELECT CODPARC FROM parceiros WHERE is_cliente = 1
         UNION
         SELECT CODPARC FROM vendas_ano
       )
       SELECT
         (SELECT COUNT(*) FROM clientes_base) AS total_clientes,
         (SELECT COUNT(*) FROM parceiros WHERE is_cliente = 1 AND ativo = 1) AS clientes_ativos,
         (SELECT COUNT(*) FROM vendas_ano) AS compradores_ano,
         COALESCE((SELECT SUM(receita) FROM vendas_ano), 0) AS receita_ano,
         COALESCE((SELECT SUM(receita) FROM vendas_ano) / NULLIF((SELECT SUM(pedidos) FROM vendas_ano), 0), 0) AS ticket_medio,
         COALESCE((SELECT SUM(valor_aberto) FROM titulos WHERE tipo = 'receber' AND is_em_aberto = 1), 0) AS receber_aberto,
         COALESCE((SELECT SUM(valor_aberto) FROM titulos WHERE tipo = 'receber' AND is_em_aberto = 1 AND DTVENC < date('now')), 0) AS receber_vencido`,
    )
    .get(ano) as {
    total_clientes: number;
    clientes_ativos: number;
    compradores_ano: number;
    receita_ano: number;
    ticket_medio: number;
    receber_aberto: number;
    receber_vencido: number;
  };

  const fluxo = db
    .prepare(
      `WITH vendas AS (
         SELECT CODPARC, DTFATUR, VLRNOTA
         FROM pedidos p
         WHERE ${WHERE_FATURAMENTO}
       ),
       primeira AS (
         SELECT CODPARC, MIN(DTFATUR) AS primeira_compra
         FROM vendas
         GROUP BY CODPARC
       )
       SELECT
         strftime('%Y-%m', v.DTFATUR) AS mes,
         COUNT(DISTINCT CASE WHEN strftime('%Y-%m', primeira.primeira_compra) = strftime('%Y-%m', v.DTFATUR) THEN v.CODPARC END) AS novos,
         COUNT(DISTINCT CASE WHEN primeira.primeira_compra < date(v.DTFATUR, 'start of month') THEN v.CODPARC END) AS recorrentes,
         COALESCE(SUM(v.VLRNOTA), 0) AS receita
       FROM vendas v
       JOIN primeira ON primeira.CODPARC = v.CODPARC
       WHERE strftime('%Y', v.DTFATUR) = ?
       GROUP BY mes
       ORDER BY mes`,
    )
    .all(ano) as ClienteFluxoMes[];

  const segmentos = db
    .prepare(
      `WITH vendas_ano AS (
         SELECT CODPARC, SUM(VLRNOTA) AS receita
         FROM pedidos p
         WHERE ${WHERE_FATURAMENTO}
           AND strftime('%Y', p.DTFATUR) = ?
         GROUP BY CODPARC
       )
       SELECT
         CASE
           WHEN COALESCE(par.TIPPESSOA, '') = 'J' THEN 'Pessoa juridica'
           WHEN COALESCE(par.TIPPESSOA, '') = 'F' THEN 'Pessoa fisica'
           ELSE 'Nao informado'
         END AS name,
         COUNT(*) AS value,
         COALESCE(SUM(v.receita), 0) AS receita
       FROM vendas_ano v
       LEFT JOIN parceiros par ON par.CODPARC = v.CODPARC
       GROUP BY name
       ORDER BY value DESC`,
    )
    .all(ano) as ClienteSegmento[];

  const topClientes = db
    .prepare(
      `WITH vendas_ano AS (
         SELECT CODPARC, COUNT(*) AS pedidos, SUM(VLRNOTA) AS receita, MAX(DTFATUR) AS ultima_compra
         FROM pedidos p
         WHERE ${WHERE_FATURAMENTO}
           AND strftime('%Y', p.DTFATUR) = ?
         GROUP BY CODPARC
       ),
       aberto AS (
         SELECT CODPARC, SUM(valor_aberto) AS receber_aberto
         FROM titulos
         WHERE tipo = 'receber' AND is_em_aberto = 1
         GROUP BY CODPARC
       )
       SELECT
         v.CODPARC,
         COALESCE(par.NOMEPARC, 'CLIENTE ' || v.CODPARC) AS NOMEPARC,
         par.TIPPESSOA,
         par.CIDADE AS cidade,
         par.UF AS uf,
         v.receita,
         v.pedidos,
         COALESCE(v.receita / NULLIF(v.pedidos, 0), 0) AS ticket_medio,
         v.ultima_compra,
         COALESCE(a.receber_aberto, 0) AS receber_aberto
       FROM vendas_ano v
       LEFT JOIN parceiros par ON par.CODPARC = v.CODPARC
       LEFT JOIN aberto a ON a.CODPARC = v.CODPARC
       ORDER BY v.receita DESC
       LIMIT 30`,
    )
    .all(ano) as ClienteTop[];

  return {
    ano,
    snapshot_at: snapshotPedidosAt(),
    total_clientes: kpi.total_clientes,
    clientes_ativos: kpi.clientes_ativos,
    compradores_ano: kpi.compradores_ano,
    receita_ano: round2(kpi.receita_ano),
    ticket_medio: round2(kpi.ticket_medio),
    receber_aberto: round2(kpi.receber_aberto),
    receber_vencido: round2(kpi.receber_vencido),
    fluxo: fluxo.map((row) => ({ ...row, receita: round2(row.receita) })),
    segmentos: segmentos.map((row) => ({ ...row, receita: round2(row.receita) })),
    top_clientes: topClientes.map((row) => ({
      ...row,
      receita: round2(row.receita),
      ticket_medio: round2(row.ticket_medio),
      receber_aberto: round2(row.receber_aberto),
    })),
  };
}

export function rhBI(): RhBI {
  const db = getDb();
  const ano = currentYear();

  const kpi = db
    .prepare(
      `WITH vendas_ano AS (
         SELECT CODVEND, COUNT(*) AS pedidos, SUM(VLRNOTA) AS faturamento
         FROM pedidos p
         WHERE ${WHERE_FATURAMENTO}
           AND strftime('%Y', p.DTFATUR) = ?
           AND p.CODVEND IS NOT NULL
         GROUP BY CODVEND
       )
       SELECT
         (SELECT COUNT(*) FROM vendedores) AS total_vendedores,
         (SELECT COUNT(*) FROM vendedores WHERE ativo = 1) AS vendedores_ativos,
         (SELECT COUNT(*) FROM vendas_ano) AS vendedores_com_venda,
         COALESCE((SELECT SUM(faturamento) FROM vendas_ano), 0) AS faturamento_ano,
         COALESCE((SELECT SUM(faturamento) FROM vendas_ano) / NULLIF((SELECT SUM(pedidos) FROM vendas_ano), 0), 0) AS ticket_medio`,
    )
    .get(ano) as {
    total_vendedores: number;
    vendedores_ativos: number;
    vendedores_com_venda: number;
    faturamento_ano: number;
    ticket_medio: number;
  };

  const porEmpresa = db
    .prepare(
      `SELECT
         e.CODEMP,
         e.NOMEFANTASIA,
         COUNT(DISTINCT p.CODVEND) AS vendedores,
         COALESCE(SUM(p.VLRNOTA), 0) AS faturamento
       FROM empresas e
       LEFT JOIN pedidos p
         ON p.CODEMP = e.CODEMP
         AND ${WHERE_FATURAMENTO}
         AND strftime('%Y', p.DTFATUR) = ?
         AND p.CODVEND IS NOT NULL
       WHERE e.ordem < 99
       GROUP BY e.CODEMP, e.NOMEFANTASIA
       ORDER BY faturamento DESC`,
    )
    .all(ano) as RhEmpresaLinha[];

  const ranking = db
    .prepare(
      `SELECT
         v.CODVEND,
         v.APELIDO,
         v.ativo,
         COALESCE(SUM(p.VLRNOTA), 0) AS faturamento,
         COUNT(p.NUNOTA) AS pedidos,
         COALESCE(SUM(p.VLRNOTA) / NULLIF(COUNT(p.NUNOTA), 0), 0) AS ticket_medio,
         MAX(p.DTFATUR) AS ultima_venda
       FROM vendedores v
       LEFT JOIN pedidos p
         ON p.CODVEND = v.CODVEND
         AND ${WHERE_FATURAMENTO}
         AND strftime('%Y', p.DTFATUR) = ?
       GROUP BY v.CODVEND, v.APELIDO, v.ativo
       ORDER BY faturamento DESC, v.APELIDO
       LIMIT 30`,
    )
    .all(ano) as RhRankingLinha[];

  const mensal = db
    .prepare(
      `SELECT
         strftime('%Y-%m', p.DTFATUR) AS mes,
         COUNT(DISTINCT p.CODVEND) AS vendedores,
         COUNT(*) AS pedidos,
         COALESCE(SUM(p.VLRNOTA), 0) AS faturamento
       FROM pedidos p
       WHERE ${WHERE_FATURAMENTO}
         AND strftime('%Y', p.DTFATUR) = ?
         AND p.CODVEND IS NOT NULL
       GROUP BY mes
       ORDER BY mes`,
    )
    .all(ano) as RhMensalLinha[];

  return {
    ano,
    snapshot_at: snapshotPedidosAt(),
    total_vendedores: kpi.total_vendedores,
    vendedores_ativos: kpi.vendedores_ativos,
    vendedores_com_venda: kpi.vendedores_com_venda,
    faturamento_ano: round2(kpi.faturamento_ano),
    ticket_medio: round2(kpi.ticket_medio),
    media_por_vendedor_ativo:
      kpi.vendedores_ativos > 0 ? round2(kpi.faturamento_ano / kpi.vendedores_ativos) : 0,
    por_empresa: porEmpresa.map((row) => ({ ...row, faturamento: round2(row.faturamento) })),
    ranking: ranking.map((row) => ({
      ...row,
      faturamento: round2(row.faturamento),
      ticket_medio: round2(row.ticket_medio),
    })),
    mensal: mensal.map((row) => ({ ...row, faturamento: round2(row.faturamento) })),
  };
}
