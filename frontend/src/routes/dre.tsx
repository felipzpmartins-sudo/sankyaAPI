import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  LoaderCircle,
  Percent,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";

import { KpiCard } from "@/components/dashboard/KpiCard";
import { PanelCard } from "@/components/dashboard/PanelCard";
import { QueryState } from "@/components/dashboard/QueryState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDreDashboard } from "@/hooks/use-dashboard-data";
import {
  barTooltipCursor,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
  chartTooltipStyle,
  lineTooltipCursor,
} from "@/lib/chart-style";
import { useFilters } from "@/lib/filters-context";
import {
  exportarFinanceiro,
  type FinanceiroExportTipo,
} from "@/lib/financeiro-export";
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePageSnapshot } from "@/lib/snapshot-context";
import { EmptyTableRow } from "@/components/dashboard/EmptyTableRow";

export const Route = createFileRoute("/dre")({
  head: () => ({
    meta: [
      { title: "Financeiro / DRE · Dashboards Sankhya" },
      {
        name: "description",
        content:
          "Resultado operacional consolidado e por projeto: receita, despesas, resultado e margem.",
      },
    ],
  }),
  component: DrePage,
});

function DrePage() {
  const { filters } = useFilters();
  const [receberPage, setReceberPage] = useState(0);
  const [pagarPage, setPagarPage] = useState(0);
  const [exportando, setExportando] = useState<FinanceiroExportTipo | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const query = useDreDashboard(filters, receberPage, pagarPage);
  usePageSnapshot(query.data?.snapshot_at);
  if (query.isPending || query.error) {
    return <QueryState loading={query.isPending} error={query.error} retry={() => void query.refetch()} />;
  }
  const { contasPagar, contasPagarMeta, contasReceber, contasReceberMeta, dreConsolidado, dreProjetos, fluxoCaixa } = query.data;
  const resultadoTone = dreConsolidado.resultado_operacional >= 0 ? "success" : "danger";

  async function exportar(tipo: FinanceiroExportTipo) {
    setExportando(tipo);
    setExportError(null);
    try {
      await exportarFinanceiro(tipo, filters);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Não foi possível gerar o Excel.");
    } finally {
      setExportando(null);
    }
  }

  return (
    <div className="space-y-6">
      {exportError && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {exportError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Receita bruta"
          value={formatCurrency(dreConsolidado.receita_bruta)}
          hint="soma dos projetos"
          tone="success"
          icon={ArrowUpCircle}
        />
        <KpiCard
          label="Despesas totais"
          value={formatCurrency(dreConsolidado.despesas_total)}
          hint="custos + admin + comerciais + impostos"
          tone="danger"
          icon={ArrowDownCircle}
        />
        <KpiCard
          label="Resultado operacional"
          value={formatCurrency(dreConsolidado.resultado_operacional)}
          hint="receita − despesas"
          tone={resultadoTone}
          icon={TrendingUp}
        />
        <KpiCard
          label="Margem %"
          value={formatPercent(dreConsolidado.margem_pct)}
          hint="resultado / receita"
          tone="primary"
          icon={Percent}
        />
      </div>

      {/* DRE Comparativo */}
      <PanelCard
        title="DRE comparativo por projeto"
        description="Linhas = categorias · Colunas = projetos · Última coluna = consolidado"
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={exportando != null}
            onClick={() => void exportar("dre-comparativo")}
          >
            {exportando === "dre-comparativo" ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Exportar Excel
          </Button>
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="sticky left-0 z-10 bg-surface text-[11px] uppercase text-muted-foreground">
                  Categoria
                </TableHead>
                {dreProjetos.map((p) => (
                  <TableHead key={p.codproj} className="text-right text-[11px] uppercase text-muted-foreground">
                    {p.nome.replace("Projeto ", "")}
                  </TableHead>
                ))}
                <TableHead className="text-right text-[11px] uppercase text-primary">Consolidado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(
                [
                  { key: "receita_bruta", label: "Receita", tone: "success" as const },
                  { key: "custos", label: "Custos", tone: "danger" as const, negative: true },
                  { key: "despesas_admin", label: "Desp. Admin.", tone: "danger" as const, negative: true },
                  { key: "despesas_comerciais", label: "Desp. Comerciais", tone: "danger" as const, negative: true },
                  { key: "impostos", label: "Impostos", tone: "danger" as const, negative: true },
                  { key: "resultado_operacional", label: "Resultado", tone: "primary" as const, bold: true },
                ]
              ).map((row) => (
                <TableRow key={row.key} className="border-border/40 hover:bg-surface-elevated/60">
                  <TableCell
                    className={cn(
                      "sticky left-0 z-10 bg-surface text-sm text-foreground",
                      row.bold && "font-semibold",
                    )}
                  >
                    {row.label}
                  </TableCell>
                  {dreProjetos.map((p) => {
                    const v = p[row.key as keyof typeof p] as number;
                    return (
                      <TableCell
                        key={p.codproj}
                        className={cn(
                          "text-right text-sm tabular-nums",
                          row.negative && "text-danger",
                          row.tone === "success" && "text-foreground",
                          row.tone === "primary" &&
                            (v >= 0 ? "font-semibold text-success" : "font-semibold text-danger"),
                        )}
                      >
                        {formatCompactCurrency(row.negative ? -v : v)}
                      </TableCell>
                    );
                  })}
                  <TableCell
                    className={cn(
                      "text-right text-sm tabular-nums",
                      row.negative && "text-danger",
                      row.tone === "primary" &&
                        (dreConsolidado[row.key as keyof typeof dreConsolidado] >= 0
                          ? "font-bold text-success"
                          : "font-bold text-danger"),
                      row.tone !== "primary" && "font-semibold text-foreground",
                    )}
                  >
                    {formatCompactCurrency(
                      row.negative
                        ? -(dreConsolidado[row.key as keyof typeof dreConsolidado] as number)
                        : (dreConsolidado[row.key as keyof typeof dreConsolidado] as number),
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-border/60 bg-surface-elevated/40">
                <TableCell className="sticky left-0 z-10 bg-surface-elevated/40 text-sm font-semibold text-foreground">
                  Margem %
                </TableCell>
                {dreProjetos.map((p) => (
                  <TableCell
                    key={p.codproj}
                    className={cn(
                      "text-right text-sm font-semibold tabular-nums",
                      p.margem_pct >= 0 ? "text-success" : "text-danger",
                    )}
                  >
                    {formatPercent(p.margem_pct)}
                  </TableCell>
                ))}
                <TableCell
                  className={cn(
                    "text-right text-sm font-bold tabular-nums",
                    dreConsolidado.margem_pct >= 0 ? "text-success" : "text-danger",
                  )}
                >
                  {formatPercent(dreConsolidado.margem_pct)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </PanelCard>

      {/* Fluxo de Caixa */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PanelCard
          title="Fluxo de caixa"
          description="Entradas vs saídas · Linha = saldo"
          bodyClassName="p-0"
        >
          <div className="h-[320px] w-full px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={fluxoCaixa}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickFormatter={(v) => formatCompactCurrency(v as number)}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  itemStyle={chartTooltipItemStyle}
                  cursor={lineTooltipCursor}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-muted-foreground)" }} />
                <Bar name="Entradas" dataKey="entradas" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
                <Bar name="Saídas" dataKey="saidas" fill="var(--color-danger)" radius={[4, 4, 0, 0]} />
                <Line
                  name="Saldo"
                  type="monotone"
                  dataKey="saldo"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "var(--color-chart-1)" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>

        <PanelCard
          title="Distribuição de despesas"
          description="Consolidado por categoria"
          bodyClassName="p-0"
        >
          <div className="h-[320px] w-full px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { cat: "Custos", valor: dreConsolidado.custos },
                  { cat: "Admin.", valor: dreConsolidado.despesas_admin },
                  { cat: "Comerciais", valor: dreConsolidado.despesas_comerciais },
                  { cat: "Impostos", valor: dreConsolidado.impostos },
                ]}
              >
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="cat" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickFormatter={(v) => formatCompactCurrency(v as number)}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipLabelStyle}
                  itemStyle={chartTooltipItemStyle}
                  cursor={barTooltipCursor}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Bar dataKey="valor" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>
      </div>

      {/* Contas */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ContasTable
          title="Contas a receber"
          tipo="receber"
          data={contasReceber}
          meta={contasReceberMeta}
          exporting={exportando === "contas-receber"}
          exportDisabled={exportando != null}
          onExport={() => void exportar("contas-receber")}
          onPageChange={setReceberPage}
        />
        <ContasTable
          title="Contas a pagar"
          tipo="pagar"
          data={contasPagar}
          meta={contasPagarMeta}
          exporting={exportando === "contas-pagar"}
          exportDisabled={exportando != null}
          onExport={() => void exportar("contas-pagar")}
          onPageChange={setPagarPage}
        />
      </div>
    </div>
  );
}

function ContasTable({
  title,
  tipo,
  data,
  meta,
  exporting,
  exportDisabled,
  onExport,
  onPageChange,
}: {
  title: string;
  tipo: "receber" | "pagar";
  data: { parceiro: string; vencimento: string; valor_aberto: number; dias_atraso: number }[];
  meta: { page: number; pageSize: number; total: number; valorTotal: number };
  exporting: boolean;
  exportDisabled: boolean;
  onExport: () => void;
  onPageChange: (page: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  return (
    <PanelCard
      title={title}
      description={`Total em aberto · ${tipo}`}
      action={
        <Button size="sm" variant="outline" disabled={exportDisabled} onClick={onExport}>
          {exporting ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Exportar Excel
        </Button>
      }
      bodyClassName="p-0"
    >
      <Table>
        <TableHeader>
          <TableRow className="border-border/60 hover:bg-transparent">
            <TableHead className="text-[11px] uppercase text-muted-foreground">Parceiro</TableHead>
            <TableHead className="text-[11px] uppercase text-muted-foreground">Vencimento</TableHead>
            <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Valor aberto</TableHead>
            <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Atraso</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 && <EmptyTableRow colSpan={4} />}
          {data.map((r, i) => (
            <TableRow key={i} className="border-border/40 hover:bg-surface-elevated/60">
              <TableCell className="text-foreground">{r.parceiro}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(r.vencimento)}</TableCell>
              <TableCell className="text-right font-medium text-foreground">
                {formatCurrency(r.valor_aberto)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right text-sm",
                  r.dias_atraso > 30
                    ? "font-semibold text-danger"
                    : r.dias_atraso > 0
                      ? "text-warning"
                      : "text-muted-foreground",
                )}
              >
                {r.dias_atraso === 0 ? "—" : `${r.dias_atraso}d`}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 border-border/70 bg-surface-elevated/30">
            <TableCell colSpan={2} className="text-sm font-semibold text-foreground">Total</TableCell>
            <TableCell className="text-right text-sm font-bold text-foreground">
              {formatCurrency(meta.valorTotal)}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
      <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
        <span>{meta.total} títulos · página {meta.page + 1} de {paginas}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={meta.page === 0} onClick={() => onPageChange(meta.page - 1)}>
            Anterior
          </Button>
          <Button size="sm" variant="outline" disabled={meta.page + 1 >= paginas} onClick={() => onPageChange(meta.page + 1)}>
            Próxima
          </Button>
        </div>
      </div>
    </PanelCard>
  );
}
