import { getDb } from "../db/connection.js";
import { empresaToSqlClause, type EmpresaFiltro } from "../utils/empresa.js";

export type EstoqueKpi = {
  label: string;
  value: string;
  delta?: string;
  up: boolean;
  color: string;
  alert?: boolean;
};

export type EstoqueNivel = {
  cat: string;
  atual: number;
  min: number;
};

export type EstoqueAlerta = {
  item: string;
  empresa: string | null;
  local: string | null;
  parceiro: string | null;
  atual: number;
  min: number;
  status: "green" | "amber" | "red";
};

export type EstoqueLocal = {
  empresa: string;
  local: string;
  linhas: number;
  estoque: number;
};

export type EstoqueNegativo = {
  item: string;
  empresa: string;
  local: string;
  parceiro: string;
  estoque: number;
};

export type EstoqueDto = {
  filtro: string;
  snapshot_at: string | null;
  kpis: EstoqueKpi[];
  niveis: EstoqueNivel[];
  alertas: EstoqueAlerta[];
  locais: EstoqueLocal[];
  negativos: EstoqueNegativo[];
};

function snapshotEstoqueAt(): string | null {
  const row = getDb()
    .prepare("SELECT last_synced_at FROM sync_state WHERE entity = 'estoque'")
    .get() as { last_synced_at: string | null } | undefined;
  return row?.last_synced_at ?? null;
}

function describeFiltro(empresa: EmpresaFiltro): string {
  return empresa.modo === "todas" ? "todas" : `lista[${empresa.ids.join(",")}]`;
}

function statusFromStock(atual: number, minimo: number): "green" | "amber" | "red" {
  if (minimo <= 0) return "green";
  if (atual <= minimo * 0.5) return "red";
  if (atual < minimo) return "amber";
  return "green";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function estoqueVisaoGeral(empresa: EmpresaFiltro): EstoqueDto {
  const db = getDb();
  const { clause: empresaClause, params: empresaParams } = empresaToSqlClause(empresa, "e.CODEMP");
  const empresaWhere = empresaClause ? ` AND ${empresaClause}` : "";

  const rows = db
    .prepare(
      `SELECT COALESCE(p.GRUPO_DESCR, 'Outros') AS cat,
              COALESCE(e.ESTOQUE, 0) AS atual,
              COALESCE(e.EST_MINIMO, 0) AS minimo
       FROM produto_estoque e
       JOIN produtos p ON p.CODPROD = e.CODPROD
       WHERE p.ativo = 1${empresaWhere}`,
    )
    .all(...empresaParams) as Array<{ cat: string; atual: number; minimo: number }>;

  const totals = rows.reduce(
    (acc, row) => {
      acc.total += row.atual;
      acc.totalMin += row.minimo;
      if (row.minimo > 0 && row.atual < row.minimo) acc.belowMin += 1;
      if (row.atual < 0) acc.negativeRows += 1;
      return acc;
    },
    { total: 0, totalMin: 0, belowMin: 0, negativeRows: 0 },
  );

  const categorySummary = Object.values(
    rows.reduce<Record<string, { cat: string; atual: number; min: number }>>((map, row) => {
      const key = row.cat;
      if (!map[key]) {
        map[key] = { cat: key, atual: 0, min: 0 };
      }
      map[key].atual += row.atual;
      map[key].min += row.minimo;
      return map;
    }, {}),
  )
    .sort((a, b) => b.atual - a.atual)
    .slice(0, 6);

  const alertRows = db
    .prepare(
      `SELECT p.DESCRPROD AS item,
              e.EMPRESA_NOMEFANTASIA AS empresa,
              e.LOCAL_DESCR AS local,
              e.PARCEIRO_NOMEPARC AS parceiro,
              COALESCE(e.ESTOQUE, 0) AS atual,
              COALESCE(e.EST_MINIMO, 0) AS minimo
       FROM produto_estoque e
       JOIN produtos p ON p.CODPROD = e.CODPROD
       WHERE e.EST_MINIMO > 0
         AND e.ESTOQUE < e.EST_MINIMO
         ${empresaWhere}
       ORDER BY (e.EST_MINIMO - e.ESTOQUE) DESC
       LIMIT 6`,
    )
    .all(...empresaParams) as Array<{
      item: string;
      empresa: string | null;
      local: string | null;
      parceiro: string | null;
      atual: number;
      minimo: number;
    }>;

  const localRows = db
    .prepare(
      `SELECT COALESCE(e.EMPRESA_NOMEFANTASIA, 'EMPRESA ' || e.CODEMP) AS empresa,
              COALESCE(e.LOCAL_DESCR, '<SEM LOCAL>') AS local,
              COUNT(*) AS linhas,
              COALESCE(SUM(e.ESTOQUE), 0) AS estoque
       FROM produto_estoque e
       JOIN produtos p ON p.CODPROD = e.CODPROD
       WHERE p.ativo = 1${empresaWhere}
       GROUP BY e.CODEMP, e.CODLOCALORIG
       ORDER BY ABS(estoque) DESC
       LIMIT 8`,
    )
    .all(...empresaParams) as Array<{
      empresa: string;
      local: string;
      linhas: number;
      estoque: number;
    }>;

  const negativeRows = db
    .prepare(
      `SELECT p.DESCRPROD AS item,
              COALESCE(e.EMPRESA_NOMEFANTASIA, 'EMPRESA ' || e.CODEMP) AS empresa,
              COALESCE(e.LOCAL_DESCR, '<SEM LOCAL>') AS local,
              COALESCE(e.PARCEIRO_NOMEPARC, '<SEM PARCEIRO>') AS parceiro,
              COALESCE(e.ESTOQUE, 0) AS estoque
       FROM produto_estoque e
       JOIN produtos p ON p.CODPROD = e.CODPROD
       WHERE p.ativo = 1
         AND e.ESTOQUE < 0
         ${empresaWhere}
       ORDER BY e.ESTOQUE ASC
       LIMIT 8`,
    )
    .all(...empresaParams) as Array<{
      item: string;
      empresa: string;
      local: string;
      parceiro: string;
      estoque: number;
    }>;

  return {
    filtro: describeFiltro(empresa),
    snapshot_at: snapshotEstoqueAt(),
    kpis: [
      {
        label: "Qtde em Estoque",
        value: `${round2(totals.total).toLocaleString("pt-BR")}`,
        up: true,
        color: "#F5D547",
      },
      {
        label: "Abaixo do Mínimo",
        value: String(totals.belowMin),
        up: totals.belowMin === 0,
        color: totals.belowMin > 0 ? "#E05555" : "#2EBD8F",
        alert: totals.belowMin > 0,
      },
      {
        label: "Saldos Negativos",
        value: String(totals.negativeRows),
        up: totals.negativeRows === 0,
        color: totals.negativeRows > 0 ? "#E05555" : "#2EBD8F",
        alert: totals.negativeRows > 0,
      },
      {
        label: "Cobertura Média",
        value:
          totals.totalMin > 0
            ? `${Math.max(0, Math.round((totals.total / totals.totalMin) * 30))} dias`
            : "N/A",
        up: true,
        color: "#4DA3FF",
      },
    ],
    niveis: categorySummary.map((item) => ({
      cat: item.cat,
      atual: round2(item.atual),
      min: round2(item.min),
    })),
    alertas: alertRows.map((row) => ({
      item: row.item,
      empresa: row.empresa,
      local: row.local,
      parceiro: row.parceiro,
      atual: round2(row.atual),
      min: round2(row.minimo),
      status: statusFromStock(row.atual, row.minimo),
    })),
    locais: localRows.map((row) => ({ ...row, estoque: round2(row.estoque) })),
    negativos: negativeRows.map((row) => ({ ...row, estoque: round2(row.estoque) })),
  };
}
