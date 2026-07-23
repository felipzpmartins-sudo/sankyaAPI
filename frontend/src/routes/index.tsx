import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  CircleX,
  Download,
  FileCheck2,
  FileText,
  Layers3,
  LoaderCircle,
  ReceiptText,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Pie,
  Cell as PieCell,
  PieChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { KpiCard } from "@/components/dashboard/KpiCard";
import { PanelCard } from "@/components/dashboard/PanelCard";
import { EmptyTableRow } from "@/components/dashboard/EmptyTableRow";
import { QueryState } from "@/components/dashboard/QueryState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useRateioDashboard } from "@/hooks/use-dashboard-data";
import { useExecutivoDashboard, type ExecutivoDashboard } from "@/hooks/use-executivo-dashboard";
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
  formatInt,
  formatPercent,
} from "@/lib/format";
import { usePageSnapshot } from "@/lib/snapshot-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sankhya 3.0 - Resumo executivo" },
      {
        name: "description",
        content: "Central de relatórios de vendas e financeiro conectada ao Sankhya.",
      },
    ],
  }),
  component: CentralCeoPage,
});

type PeriodPreset = "hoje" | "semana" | "mes" | "ano" | "periodo";

const finalidadesDocumento = [
  { codigo: 40200000, nome: "MY ROBOT SHOPPING" },
  { codigo: 40300000, nome: "MY ROBOT CRICIUMA" },
  { codigo: 40400000, nome: "MAKER EDUCACAO/ROBOTICS" },
  { codigo: 40500000, nome: "E-COMMERCE" },
  { codigo: 40600000, nome: "MBA KIDS" },
  { codigo: 40700000, nome: "MAKER STORE" },
  { codigo: 40100000, nome: "MY ROBOT FRANQUEADORA" },
];

const chartColors = ["#0F3A5F", "#3B82F6", "#7DD3FC", "#22D3EE"];

const balancePeriodOptions: Array<{ value: Exclude<PeriodPreset, "periodo">; label: string }> = [
  { value: "ano", label: "Ano" },
  { value: "mes", label: "Mês" },
  { value: "semana", label: "Semana" },
  { value: "hoje", label: "Dia" },
];

function iso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function presetRange(preset: PeriodPreset, referenceDate = new Date()) {
  const now = new Date(referenceDate);
  const end = iso(now);
  if (preset === "hoje") return { dataInicio: end, dataFim: end };
  if (preset === "semana") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { dataInicio: iso(start), dataFim: end };
  }
  if (preset === "ano") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { dataInicio: iso(start), dataFim: end };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { dataInicio: iso(start), dataFim: end };
}

function selectedPreset(dataInicio: string, dataFim: string): PeriodPreset {
  const referenceDate = new Date(`${dataFim}T12:00:00`);
  for (const preset of ["hoje", "semana", "mes", "ano"] as const) {
    const range = presetRange(preset, referenceDate);
    if (range.dataInicio === dataInicio && range.dataFim === dataFim) return preset;
  }
  return "periodo";
}

function formatChartPeriod(value: string): string {
  const daily = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (daily) return `${daily[3]}/${daily[2]}`;
  const monthly = /^(\d{4})-(\d{2})$/.exec(value);
  if (monthly) return `${monthly[2]}/${monthly[1].slice(2)}`;
  return value;
}

function CentralCeoPage() {
  const { filters, setFilters } = useFilters();
  const query = useExecutivoDashboard(filters);
  const rateioQuery = useRateioDashboard(filters);
  const [exportando, setExportando] = useState<FinanceiroExportTipo | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const activePreset = selectedPreset(filters.dataInicio, filters.dataFim);
  usePageSnapshot(query.data?.snapshot_at);

  if (query.isPending || query.error || !query.data) {
    return (
      <QueryState
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;

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

  const applyPreset = (preset: PeriodPreset) => {
    if (preset === "periodo") return;
    setFilters(presetRange(preset, new Date(`${filters.dataFim}T12:00:00`)));
  };

  const comercial = data.comercial;
  const financeiro = data.financeiro;
  const periodoLabel = `${formatDate(data.periodo.dataInicio)} - ${formatDate(data.periodo.dataFim)}`;
  const fluxoSerie = financeiro.fluxo_caixa;
  const hasFluxoData = fluxoSerie.some(
    (item) => Math.abs(item.entradas) > 0.01 || Math.abs(item.saidas) > 0.01,
  );
  let saldoAcumulado = 0;
  let entradasAcumuladas = 0;
  let saidasAcumuladas = 0;
  const fluxoSerieAcumulada = fluxoSerie.map((item) => {
    saldoAcumulado += item.saldo;
    entradasAcumuladas += item.entradas;
    saidasAcumuladas += item.saidas;
    return {
      ...item,
      saldoAcumulado,
      entradasAcumuladas,
      saidasAcumuladas,
    };
  });
  const saldoCaixa = saldoAcumulado;
  const ultimoPontoSaldo = fluxoSerieAcumulada[fluxoSerieAcumulada.length - 1];
  const ultimoSaldoLabel = formatCompactCurrency(ultimoPontoSaldo?.saldoAcumulado ?? 0);
  const totalProjetos = comercial.por_projeto.reduce((acc, item) => acc + item.fechado, 0);
  const projetoTopo = [...comercial.por_projeto].sort((a, b) => b.fechado - a.fechado)[0];
  const saldoPendente = financeiro.conta_receber_aberto.valor - financeiro.conta_pagar_aberto.valor;
  const rateioData = rateioQuery.data?.status === "OK" ? rateioQuery.data : null;
  const rateioPorProjeto = rateioData?.rateio_por_projeto ?? [];
  const rateioPorProjetoMap = new Map(rateioPorProjeto.map((item) => [item.codproj, item]));
  const valorRateadoTotal = rateioData?.resumo.valor_rateado_total ?? 0;
  const rateioSemRateio = rateioData?.resumo.sem_rateio ?? 0;
  const rateioIncompleto = rateioData?.resumo.rateio_incompleto ?? 0;
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="font-geist text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Sankhya 3.0 / Portal executivo
          </div>
          <h2 className="mt-1 font-semibold tracking-tight text-foreground text-2xl">
            Relatórios do CEO
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Hoje, semanal, mensal e período — {periodoLabel}
          </p>
        </div>

        <ToggleGroup
          type="single"
          value={activePreset}
          className="justify-start rounded-full border border-border/40 bg-surface p-1"
          onValueChange={(value) => value && applyPreset(value as PeriodPreset)}
        >
          {[
            ["hoje", "Hoje"],
            ["semana", "Semanal"],
            ["mes", "Mensal"],
            ["ano", "Ano"],
          ].map(([value, label]) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="h-8 rounded-full px-3 text-xs text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Pedido fechado"
          value={formatCompactCurrency(comercial.fechado.valor)}
          hint={`${formatInt(comercial.fechado.qtd)} documentos`}
          tone="success"
          icon={FileCheck2}
        />
        <KpiCard
          label="Pedidos cancelados"
          value={formatCompactCurrency(comercial.cancelados.valor)}
          hint={`${formatInt(comercial.cancelados.qtd)} pedidos`}
          tone="danger"
          icon={CircleX}
        />
        <KpiCard
          label="Recebimentos"
          value={formatCompactCurrency(financeiro.recebimentos.valor)}
          hint={`${formatInt(financeiro.recebimentos.qtd)} baixas`}
          tone="primary"
          icon={ReceiptText}
        />
        <KpiCard
          label="Receber x pagar"
          value={formatCompactCurrency(saldoPendente)}
          hint={`A receber ${formatCompactCurrency(financeiro.conta_receber_aberto.valor)} / A pagar ${formatCompactCurrency(financeiro.conta_pagar_aberto.valor)}`}
          detail="Saldo líquido em aberto: a receber − a pagar. Recebimentos são baixas já realizadas no período."
          tone="danger"
          icon={WalletCards}
        />
      </div>

      {exportError && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {exportError}
        </div>
      )}

      <PanelCard
        title="Saldo total"
        description="Entradas, saídas e saldo acumulado"
        action={
          <div className="flex items-center gap-1 rounded-full border border-border/40 bg-background/40 p-1">
            {balancePeriodOptions.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={activePreset === value}
                onClick={() => applyPreset(value)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                  activePreset === value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="p-5">
          <div className="space-y-4">
            <div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo total</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-foreground lg:text-[40px]">
                    {formatCompactCurrency(saldoCaixa)}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      saldoCaixa >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
                    )}
                  >
                    {saldoCaixa >= 0 ? "+" : ""}
                    {Math.abs((saldoCaixa / Math.max(financeiro.recebimentos.valor || 1, 1)) * 100)
                      .toFixed(1)
                      .replace(".", ",")}
                    %
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="mr-3">
                    <span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary align-middle" />
                    Receitas
                  </span>
                  <span>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full bg-muted-foreground/40 align-middle" />
                    Despesas
                  </span>
                </p>
              </div>
            </div>

            <div className="h-[260px] w-full">
              {hasFluxoData ? (
                <div className="relative h-full w-full">
                  {fluxoSerieAcumulada.length === 1 ? (
                    <p className="absolute right-2 top-0 z-10 text-[10px] text-muted-foreground">
                      Uma competência com movimentação
                    </p>
                  ) : null}
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={fluxoSerieAcumulada}
                      margin={{ top: 30, right: 12, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="saldoFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.55} />
                          <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="mes"
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        dy={6}
                        tickFormatter={formatChartPeriod}
                      />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        labelStyle={chartTooltipLabelStyle}
                        itemStyle={chartTooltipItemStyle}
                        cursor={lineTooltipCursor}
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(value) => formatChartPeriod(String(value))}
                        separator=": "
                      />
                      <Area
                        type="monotone"
                        dataKey="saldoAcumulado"
                        name="Saldo acumulado"
                        stroke="var(--color-chart-1)"
                        strokeWidth={2.5}
                        fill="url(#saldoFill)"
                        activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-background)" }}
                      />
                      <ReferenceDot
                        x={ultimoPontoSaldo?.mes}
                        y={ultimoPontoSaldo?.saldoAcumulado}
                        r={5}
                        fill="var(--color-chart-1)"
                        stroke="var(--color-background)"
                        strokeWidth={3}
                        label={{
                          value: ultimoSaldoLabel,
                          position: "top",
                          fill: "var(--color-foreground)",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="grid h-full place-items-center rounded-xl border border-dashed border-border/60 bg-background/20 px-6 text-center">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Sem movimentações no período
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Selecione outro intervalo para consultar o saldo.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </PanelCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PanelCard
          title="Faturamento por projeto"
          description="Distribuição do período"
          className="overflow-hidden"
          bodyClassName="p-0"
        >
          <div className="flex flex-col gap-6 p-5 lg:flex-row lg:items-center">
            <div className="relative h-[180px] w-[180px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={comercial.por_projeto}
                    dataKey="fechado"
                    nameKey="nome"
                    innerRadius={62}
                    outerRadius={82}
                    stroke="var(--color-background)"
                    strokeWidth={2}
                    paddingAngle={2}
                  >
                    {comercial.por_projeto.map((_, index) => (
                      <PieCell key={index} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartTooltipLabelStyle}
                    itemStyle={chartTooltipItemStyle}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="w-[112px] text-center">
                  <div className="text-xl font-semibold text-foreground">
                    {Math.round(
                      ((projetoTopo?.fechado ?? 0) / Math.max(totalProjetos || 1, 1)) * 100,
                    )}
                    %
                  </div>
                  <div className="mt-1 break-words text-[9px] font-medium leading-[1.2] text-muted-foreground">
                    {projetoTopo?.nome ?? "Projeto"}
                  </div>
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_64px_88px] gap-3 px-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span />
                <span className="text-right">Share</span>
                <span className="text-right">Receita</span>
              </div>
              <ul className="space-y-2.5">
              {comercial.por_projeto.map((row, index) => {
                const pct = (row.fechado / Math.max(totalProjetos || 1, 1)) * 100;
                return (
                  <li
                    key={row.codproj}
                    className="grid grid-cols-[minmax(0,1fr)_64px_88px] items-center gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: chartColors[index % chartColors.length] }}
                      />
                      <span className="min-w-0 truncate text-foreground">{row.nome}</span>
                    </span>
                    <span className="text-right text-xs text-muted-foreground">
                      {pct.toFixed(1).replace(".", ",")}%
                    </span>
                    <span className="text-right text-xs font-medium text-foreground">
                      {formatCompactCurrency(row.fechado)}
                    </span>
                  </li>
                );
              })}
              </ul>
            </div>
          </div>
        </PanelCard>

        <PanelCard
          title="Evolução mensal"
          description="Entradas e saídas do caixa"
          className="overflow-hidden"
          bodyClassName="p-0"
        >
          <div className="h-[320px] w-full p-4">
            {hasFluxoData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={fluxoSerie}
                  barCategoryGap={18}
                  margin={{ top: 10, right: 4, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="entradaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60A5FA" />
                      <stop offset="100%" stopColor="#3B82F6" />
                    </linearGradient>
                    <linearGradient id="saidaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F87171" />
                      <stop offset="100%" stopColor="#EF4444" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" opacity={0.4} />
                  <XAxis
                    dataKey="mes"
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatChartPeriod}
                  />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatCompactCurrency(v as number)}
                    width={44}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={chartTooltipLabelStyle}
                    itemStyle={chartTooltipItemStyle}
                    cursor={barTooltipCursor}
                    formatter={(v: number) => formatCurrency(v)}
                    labelFormatter={(value) => formatChartPeriod(String(value))}
                  />
                  <Bar
                    dataKey="entradas"
                    fill="url(#entradaFill)"
                    radius={[3, 3, 0, 0]}
                    barSize={10}
                  />
                  <Bar dataKey="saidas" fill="url(#saidaFill)" radius={[3, 3, 0, 0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-xl border border-dashed border-border/60 bg-background/20 px-6 text-center">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Sem entradas ou saídas no período
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    O gráfico será exibido quando houver movimentações.
                  </p>
                </div>
              </div>
            )}
          </div>
        </PanelCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ReportListPanel
          title="Relatórios de vendas do Sankhya"
          sub="Portal de Vendas"
          rows={[
            {
              icon: FileCheck2,
              title: "Pedido de vendas - Pedido fechado",
              meta: "Status pedido",
              value: formatCurrency(comercial.fechado.valor),
              count: comercial.fechado.qtd,
              color: "var(--color-chart-2)",
            },
            {
              icon: CircleX,
              title: "Pedido de vendas - Pedidos cancelados",
              meta: "Status pedido",
              value: formatCurrency(comercial.cancelados.valor),
              count: comercial.cancelados.qtd,
              color: "var(--color-chart-4)",
            },
            {
              icon: FileText,
              title: "Nota de vendas",
              meta: "Portal de Vendas",
              value: formatCurrency(comercial.nota_venda.valor),
              count: comercial.nota_venda.qtd,
              color: "var(--color-chart-1)",
            },
            {
              icon: Layers3,
              title: "Pedido fechado x nota de vendas",
              meta: formatPercent(comercial.conversao_pct),
              value: formatCurrency(comercial.fechado.valor - comercial.nota_venda.valor),
              count: Math.abs(comercial.fechado.qtd - comercial.nota_venda.qtd),
              color: "var(--color-chart-5)",
            },
          ]}
        />

        <ReportListPanel
          title="Relatórios financeiros — recebimentos"
          sub="Financeiro"
          rows={[
            {
              icon: ArrowUpRight,
              title: "Recebimentos",
              meta: "Baixas no período",
              value: formatCurrency(financeiro.recebimentos.valor),
              count: financeiro.recebimentos.qtd,
              color: "var(--color-chart-1)",
            },
            {
              icon: Banknote,
              title: "Juros pagos, cartoes, factoring e operacoes",
              meta: "Operacoes financeiras",
              value: formatCurrency(financeiro.juros_antecipacoes.valor),
              count: financeiro.juros_antecipacoes.qtd,
              color: "var(--color-chart-3)",
            },
            {
              icon: ArrowDownRight,
              title: "Contas a pagar",
              meta: "Aberto",
              value: formatCurrency(financeiro.conta_pagar_aberto.valor),
              count: financeiro.conta_pagar_aberto.qtd,
              color: "var(--color-chart-4)",
            },
            {
              icon: CalendarDays,
              title: "Contas vencidas / atrasadas",
              meta: "Carteira atual",
              value: formatCurrency(financeiro.vencidas.valor),
              count: financeiro.vencidas.qtd,
              color: "var(--color-chart-4)",
            },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <PanelCard
          title="Finalidades / Projetos"
          description="Vendas e rateio das despesas por finalidade"
          action={
            rateioData ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge variant="secondary" className="bg-primary/15 text-primary">
                  {formatCurrency(valorRateadoTotal)} rateado
                </Badge>
                {rateioSemRateio > 0 && (
                  <Badge variant="secondary" className="gap-1 bg-warning/15 text-warning">
                    <AlertTriangle className="h-3 w-3" />
                    {formatInt(rateioSemRateio)} sem distribuição
                  </Badge>
                )}
                {rateioIncompleto > 0 && (
                  <Badge variant="secondary" className="gap-1 bg-danger/15 text-danger">
                    <AlertTriangle className="h-3 w-3" />
                    {formatInt(rateioIncompleto)} distribuição incompleta
                  </Badge>
                )}
              </div>
            ) : undefined
          }
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Projeto</TableHead>
                  <TableHead>Finalidade</TableHead>
                  <TableHead className="text-right">Pedido fechado</TableHead>
                  <TableHead className="text-right">Nota venda</TableHead>
                  <TableHead className="text-right">Cancelados</TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    Despesas rateadas
                  </TableHead>
                  <TableHead className="hidden text-right md:table-cell">Valor rateado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {finalidadesDocumento.map((item) => {
                  const projeto = data.referencias.projetos.find((p) => p.CODPROJ === item.codigo);
                  const venda = comercial.por_projeto.find((p) => p.codproj === item.codigo);
                  const rateio = rateioPorProjetoMap.get(item.codigo);
                  return (
                    <TableRow key={item.codigo} className="hover:bg-surface-elevated/60">
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {item.codigo}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {projeto?.DESCRPROJ ?? projeto?.IDENTIFICACAO ?? item.nome}
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {formatCompactCurrency(venda?.fechado ?? 0)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCompactCurrency(venda?.nota_venda ?? 0)}
                      </TableCell>
                      <TableCell className="text-right text-danger/80">
                        {formatCompactCurrency(venda?.cancelados ?? 0)}
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground md:table-cell">
                        {rateio ? formatInt(rateio.despesas) : "—"}
                      </TableCell>
                      <TableCell className="hidden text-right md:table-cell">
                        {rateio ? (
                          <div>
                            <div className="font-semibold text-foreground">
                              {formatCompactCurrency(rateio.valor_rateado)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {formatPercent(rateio.percentual)} do rateio
                            </div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </PanelCard>

        <PanelCard
          title="Fluxo para proximos meses"
          description={formatCurrency(saldoCaixa)}
          bodyClassName="p-0"
        >
          <div className="space-y-3 p-4">
            {financeiro.fluxo_caixa.slice(-6).map((item) => {
              const total = Math.max(item.entradas, item.saidas, 1);
              return (
                <div
                  key={item.mes}
                  className="rounded-xl border border-border/40 bg-background/40 p-3"
                >
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{item.mes}</span>
                    <span
                      className={cn(
                        "font-semibold",
                        item.saldo >= 0 ? "text-success" : "text-danger",
                      )}
                    >
                      {formatCompactCurrency(item.saldo)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <div className="h-1.5 rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-success"
                        style={{ width: `${Math.min((item.entradas / total) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-[11px] text-muted-foreground">
                      {formatCompactCurrency(item.entradas)}
                    </span>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-danger"
                        style={{ width: `${Math.min((item.saidas / total) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-[11px] text-muted-foreground">
                      {formatCompactCurrency(item.saidas)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </PanelCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AccountsPanel
          title="Contas a receber"
          data={financeiro.contas_receber.titulos}
          exporting={exportando === "contas-receber"}
          exportDisabled={exportando != null}
          onExport={() => void exportar("contas-receber")}
        />
        <AccountsPanel
          title="Contas a pagar"
          data={financeiro.contas_pagar.titulos}
          exporting={exportando === "contas-pagar"}
          exportDisabled={exportando != null}
          onExport={() => void exportar("contas-pagar")}
        />
      </div>

      <PanelCard
        title="Movimentos financeiros do período"
        description={`${financeiro.movimentos.length} registros`}
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={exportando != null}
            onClick={() => void exportar("movimentos")}
          >
            {exportando === "movimentos" ? (
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
              <TableRow className="hover:bg-transparent">
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Parceiro</TableHead>
                <TableHead>Natureza</TableHead>
                <TableHead>Projeto</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {financeiro.movimentos.length === 0 && <EmptyTableRow colSpan={6} />}
              {financeiro.movimentos.map((row) => (
                <TableRow key={row.nufin} className="hover:bg-surface-elevated/60">
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.data_baixa)}
                  </TableCell>
                  <TableCell>
                    <span
                      className="border px-2 py-1 text-[10px] uppercase tracking-[0.14em]"
                      style={{
                        borderColor:
                          row.tipo === "receber" ? "rgba(77,163,255,0.35)" : "rgba(224,85,85,0.35)",
                        color:
                          row.tipo === "receber" ? "var(--color-chart-1)" : "var(--color-chart-4)",
                        background:
                          row.tipo === "receber" ? "rgba(77,163,255,0.08)" : "rgba(224,85,85,0.08)",
                      }}
                    >
                      {row.tipo}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate font-medium text-foreground">
                    {row.parceiro}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate text-muted-foreground">
                    {row.natureza}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground">
                    {row.projeto}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-foreground">
                    {formatCurrency(row.valor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PanelCard>
    </div>
  );
}

function ReportListPanel({
  title,
  sub,
  rows,
}: {
  title: string;
  sub: string;
  rows: Array<{
    icon: LucideIcon;
    title: string;
    meta: string;
    value: string;
    count: number;
    color: string;
  }>;
}) {
  return (
    <PanelCard title={title} description={sub} bodyClassName="p-0">
      <div className="divide-y divide-border/40">
        {rows.map((row) => (
          <div
            key={row.title}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3"
          >
            <span
              className="grid h-9 w-9 place-items-center rounded-md border"
              style={{
                borderColor: `${row.color}55`,
                background: `${row.color}14`,
                color: row.color,
              }}
            >
              <row.icon className="h-4 w-4" strokeWidth={1.7} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-foreground">{row.title}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{row.meta}</div>
            </div>
            <div className="text-right">
              <div className="text-[13px] font-semibold text-foreground">{row.value}</div>
              <div className="text-[11px] text-muted-foreground">{formatInt(row.count)}</div>
            </div>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

function AccountsPanel({
  title,
  data,
  exporting,
  exportDisabled,
  onExport,
}: {
  title: string;
  data: ExecutivoDashboard["financeiro"]["contas_receber"]["titulos"];
  exporting: boolean;
  exportDisabled: boolean;
  onExport: () => void;
}) {
  return (
    <PanelCard
      title={title}
      description="Carteira aberta"
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
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Parceiro</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Natureza</TableHead>
              <TableHead className="text-right">Valor aberto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && <EmptyTableRow colSpan={4} />}
            {data.map((row) => (
              <TableRow key={row.NUFIN} className="hover:bg-surface-elevated/60">
                <TableCell className="max-w-[220px] truncate font-medium text-foreground">
                  {row.NOMEPARC ?? "Sem parceiro"}
                </TableCell>
                <TableCell
                  className={cn(
                    row.dias_atraso > 0 ? "font-semibold text-danger" : "text-muted-foreground",
                  )}
                >
                  {formatDate(row.DTVENC)}
                </TableCell>
                <TableCell className="max-w-[240px] truncate text-muted-foreground">
                  {row.DESCRNAT ?? "Sem natureza"}
                </TableCell>
                <TableCell className="text-right font-semibold text-foreground">
                  {formatCurrency(row.valor_aberto)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </PanelCard>
  );
}
