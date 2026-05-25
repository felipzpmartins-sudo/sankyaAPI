import { getDb } from "../db/connection.js";
import { FATURAMENTO_TOPS, inListClause } from "./operacoes.js";

const SLA_DIAS = 3;
const WHERE_LOGISTICA = `${inListClause("p.CODTIPOPER", FATURAMENTO_TOPS)} AND p.STATUSNOTA = 'L'`;
const WHERE_ENTREGUE = `${WHERE_LOGISTICA} AND p.DTFATUR IS NOT NULL`;

export type EntregaHistoricoMes = {
  mes: string;
  prazo: number;
  atrasado: number;
  transito: number;
};

export type EntregaTransportadora = {
  nome: string;
  total: number;
  no_prazo: number;
  atrasadas: number;
  on_time_pct: number;
  frete: number;
};

export type EntregaRecente = {
  NUNOTA: number;
  NUMNOTA: number | null;
  empresa: string;
  cliente: string;
  transportadora: string;
  DTNEG: string;
  DTFATUR: string | null;
  DTENTSAI: string | null;
  prazo_dias: number | null;
  valor: number;
  frete: number;
  status: "prazo" | "atrasado" | "transito";
};

export type EntregasBI = {
  ano: string;
  sla_dias: number;
  snapshot_at: string | null;
  total_notas: number;
  no_prazo: number;
  atrasadas: number;
  em_transito: number;
  on_time_pct: number;
  prazo_medio_dias: number;
  frete_total: number;
  volumes: number;
  historico: EntregaHistoricoMes[];
  transportadoras: EntregaTransportadora[];
  recentes: EntregaRecente[];
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

export function entregasBI(): EntregasBI {
  const db = getDb();
  const ano = currentYear();

  const kpi = db
    .prepare(
      `WITH base AS (
         SELECT
           p.NUNOTA,
           p.DTNEG,
           p.DTFATUR,
           COALESCE(p.DTENTSAI, p.DTFATUR) AS data_saida,
           COALESCE(p.VLRFRETE, 0) AS frete,
           COALESCE(p.QTDVOL, 0) AS volumes,
           julianday(COALESCE(p.DTENTSAI, p.DTFATUR)) - julianday(p.DTNEG) AS prazo_dias
         FROM pedidos p
         WHERE ${WHERE_LOGISTICA}
           AND strftime('%Y', p.DTNEG) = ?
       )
       SELECT
         COUNT(*) AS total_notas,
         SUM(CASE WHEN DTFATUR IS NOT NULL AND prazo_dias <= ? THEN 1 ELSE 0 END) AS no_prazo,
         SUM(CASE WHEN DTFATUR IS NOT NULL AND prazo_dias > ? THEN 1 ELSE 0 END) AS atrasadas,
         SUM(CASE WHEN DTFATUR IS NULL THEN 1 ELSE 0 END) AS em_transito,
         COALESCE(AVG(CASE WHEN DTFATUR IS NOT NULL THEN prazo_dias END), 0) AS prazo_medio_dias,
         COALESCE(SUM(frete), 0) AS frete_total,
         COALESCE(SUM(volumes), 0) AS volumes
       FROM base`,
    )
    .get(ano, SLA_DIAS, SLA_DIAS) as {
    total_notas: number;
    no_prazo: number;
    atrasadas: number;
    em_transito: number;
    prazo_medio_dias: number;
    frete_total: number;
    volumes: number;
  };

  const historico = db
    .prepare(
      `SELECT
         strftime('%Y-%m', p.DTNEG) AS mes,
         SUM(CASE
           WHEN p.DTFATUR IS NOT NULL
            AND julianday(COALESCE(p.DTENTSAI, p.DTFATUR)) - julianday(p.DTNEG) <= ?
           THEN 1 ELSE 0 END) AS prazo,
         SUM(CASE
           WHEN p.DTFATUR IS NOT NULL
            AND julianday(COALESCE(p.DTENTSAI, p.DTFATUR)) - julianday(p.DTNEG) > ?
           THEN 1 ELSE 0 END) AS atrasado,
         SUM(CASE WHEN p.DTFATUR IS NULL THEN 1 ELSE 0 END) AS transito
       FROM pedidos p
       WHERE ${WHERE_LOGISTICA}
         AND strftime('%Y', p.DTNEG) = ?
       GROUP BY mes
       ORDER BY mes`,
    )
    .all(SLA_DIAS, SLA_DIAS, ano) as EntregaHistoricoMes[];

  const transportadoras = db
    .prepare(
      `SELECT
         COALESCE(p.TRANSPORTADORA_NOME, 'Sem transportadora') AS nome,
         COUNT(*) AS total,
         SUM(CASE
           WHEN julianday(COALESCE(p.DTENTSAI, p.DTFATUR)) - julianday(p.DTNEG) <= ?
           THEN 1 ELSE 0 END) AS no_prazo,
         SUM(CASE
           WHEN julianday(COALESCE(p.DTENTSAI, p.DTFATUR)) - julianday(p.DTNEG) > ?
           THEN 1 ELSE 0 END) AS atrasadas,
         COALESCE(SUM(p.VLRFRETE), 0) AS frete
       FROM pedidos p
       WHERE ${WHERE_ENTREGUE}
         AND strftime('%Y', p.DTNEG) = ?
       GROUP BY nome
       ORDER BY total DESC, no_prazo DESC
       LIMIT 12`,
    )
    .all(SLA_DIAS, SLA_DIAS, ano) as Array<Omit<EntregaTransportadora, "on_time_pct">>;

  const recentes = db
    .prepare(
      `SELECT
         p.NUNOTA,
         p.NUMNOTA,
         COALESCE(e.NOMEFANTASIA, '-') AS empresa,
         COALESCE(par.NOMEPARC, 'CLIENTE ' || p.CODPARC) AS cliente,
         COALESCE(p.TRANSPORTADORA_NOME, 'Sem transportadora') AS transportadora,
         p.DTNEG,
         p.DTFATUR,
         p.DTENTSAI,
         CASE
           WHEN p.DTFATUR IS NULL THEN NULL
           ELSE julianday(COALESCE(p.DTENTSAI, p.DTFATUR)) - julianday(p.DTNEG)
         END AS prazo_dias,
         p.VLRNOTA AS valor,
         p.VLRFRETE AS frete,
         CASE
           WHEN p.DTFATUR IS NULL THEN 'transito'
           WHEN julianday(COALESCE(p.DTENTSAI, p.DTFATUR)) - julianday(p.DTNEG) <= ? THEN 'prazo'
           ELSE 'atrasado'
         END AS status
       FROM pedidos p
       LEFT JOIN empresas e ON e.CODEMP = p.CODEMP
       LEFT JOIN parceiros par ON par.CODPARC = p.CODPARC
       WHERE ${WHERE_LOGISTICA}
         AND strftime('%Y', p.DTNEG) = ?
       ORDER BY p.DTNEG DESC, p.NUNOTA DESC
       LIMIT 30`,
    )
    .all(SLA_DIAS, ano) as EntregaRecente[];

  const concluidas = kpi.no_prazo + kpi.atrasadas;

  return {
    ano,
    sla_dias: SLA_DIAS,
    snapshot_at: snapshotPedidosAt(),
    total_notas: kpi.total_notas,
    no_prazo: kpi.no_prazo,
    atrasadas: kpi.atrasadas,
    em_transito: kpi.em_transito,
    on_time_pct: concluidas > 0 ? round2((kpi.no_prazo / concluidas) * 100) : 0,
    prazo_medio_dias: round2(kpi.prazo_medio_dias),
    frete_total: round2(kpi.frete_total),
    volumes: round2(kpi.volumes),
    historico,
    transportadoras: transportadoras.map((row) => ({
      ...row,
      frete: round2(row.frete),
      on_time_pct: row.total > 0 ? round2((row.no_prazo / row.total) * 100) : 0,
    })),
    recentes: recentes.map((row) => ({
      ...row,
      prazo_dias: row.prazo_dias == null ? null : round2(row.prazo_dias),
      valor: round2(row.valor),
      frete: round2(row.frete),
    })),
  };
}
