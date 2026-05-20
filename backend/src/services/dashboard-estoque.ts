import { getDb } from "../db/connection.js";
import type { EmpresaFiltro } from "../utils/empresa.js";

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
  atual: number;
  min: number;
  status: "green" | "amber" | "red";
};

export type EstoqueDto = {
  filtro: string;
  snapshot_at: string | null;
  kpis: EstoqueKpi[];
  niveis: EstoqueNivel[];
  alertas: EstoqueAlerta[];
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

export function estoqueVisaoGeral(empresa: EmpresaFiltro): EstoqueDto {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT COALESCE(p.GRUPO_DESCR, 'Outros') AS cat,
              COALESCE(e.ESTOQUE, 0) AS atual,
              COALESCE(e.EST_MINIMO, 0) AS minimo
       FROM produtos p
       LEFT JOIN produto_estoque e ON e.CODPROD = p.CODPROD
       WHERE p.ativo = 1`,
    )
    .all() as Array<{ cat: string; atual: number; minimo: number }>;

  const totals = rows.reduce(
    (acc, row) => {
      acc.total += row.atual;
      acc.totalMin += row.minimo;
      if (row.minimo > 0 && row.atual < row.minimo) acc.belowMin += 1;
      return acc;
    },
    { total: 0, totalMin: 0, belowMin: 0 },
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
              COALESCE(e.ESTOQUE, 0) AS atual,
              COALESCE(e.EST_MINIMO, 0) AS minimo
       FROM produto_estoque e
       JOIN produtos p ON p.CODPROD = e.CODPROD
       WHERE e.EST_MINIMO > 0
         AND e.ESTOQUE < e.EST_MINIMO
       ORDER BY (e.EST_MINIMO - e.ESTOQUE) DESC
       LIMIT 3`,
    )
    .all() as Array<{ item: string; atual: number; minimo: number }>;

  return {
    filtro: describeFiltro(empresa),
    snapshot_at: snapshotEstoqueAt(),
    kpis: [
      {
        label: "Qtde em Estoque",
        value: `${totals.total.toLocaleString("pt-BR")}`,
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
        label: "Giro de Estoque",
        value:
          totals.totalMin > 0 ? `${(totals.total / totals.totalMin).toFixed(1)}x` : "N/A",
        up: true,
        color: "#2EBD8F",
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
    niveis: categorySummary.map((item) => ({ cat: item.cat, atual: item.atual, min: item.min })),
    alertas: alertRows.map((row) => ({
      item: row.item,
      atual: row.atual,
      min: row.minimo,
      status: statusFromStock(row.atual, row.minimo),
    })),
  };
}
