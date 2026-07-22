import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  CircleX,
  FileCheck2,
  FileText,
  Layers3,
  ReceiptText,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
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
import { useFilters } from "@/lib/filters-context";
import { formatCompactCurrency, formatCurrency, formatDate, formatInt, formatPercent } from "@/lib/format";
import { usePageSnapshot } from "@/lib/snapshot-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sankhya 3.0 - Central CEO" },
      {
        name: "description",
        content: "Central de relatorios de vendas e financeiro conectada ao Sankhya.",
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

const chartColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "var(--color-popover)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    fontSize: 12,
    color: "var(--color-foreground)",
    padding: "8px 10px",
  },
  labelStyle: { color: "var(--color-muted-foreground)", fontSize: 10, textTransform: "uppercase" as const },
  itemStyle: { color: "var(--color-foreground)" },
} as const;

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function presetRange(preset: PeriodPreset) {
  const now = new Date();
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

function CentralCeoPage() {
  const { filters, setFilters } = useFilters();
  const query = useExecutivoDashboard(filters);
  const rateioQuery = useRateioDashboard(filters);
  const data = query.data;
  usePageSnapshot(data?.snapshot_at);

  if (query.isPending || query.error) {
    return <QueryState loading={query.isPending} error={query.error} retry={() => void query.refetch()} />;
  }

  const applyPreset = (preset: PeriodPreset) => {
    if (preset === "periodo") return;
    setFilters(presetRange(preset));
  };

  const comercial = data.comercial;
  const financeiro = data.financeiro;
  const periodoLabel = `${formatDate(data.periodo.dataInicio)} - ${formatDate(data.periodo.dataFim)}`;
  const fluxoSerieBase =
    financeiro.fluxo_caixa.length > 0
      ? financeiro.fluxo_caixa
      : [{ mes: "Sem dados", entradas: 0, saidas: 0, saldo: 0 }];
  const fluxoSerie = fluxoSerieBase.map((item) => item);
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
            Relatorios do CEO
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Hoje, semanal, mensal e periodo - {periodoLabel}
          </p>
        </div>

        <ToggleGroup
          type="single"
          defaultValue="periodo"
          className="justify-start rounded-full border border-border/40 bg-surface p-1"
          onValueChange={(value) => value && applyPreset(value as PeriodPreset)}
        >
          {[
            ["hoje", "Hoje"],
            ["semana", "Semanal"],
            ["mes", "Mensal"],
            ["ano", "Ano"],
            ["periodo", "Periodo"],
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
          hint={`${formatCompactCurrency(financeiro.conta_receber_aberto.valor)} / ${formatCompactCurrency(financeiro.conta_pagar_aberto.valor)}`}
          tone="danger"
          icon={WalletCards}
        />
      </div>

      <PanelCard
        title="Saldo total"
        description="Entradas, saidas e saldo acumulado"
        action={
          <div className="flex items-center gap-1 rounded-full border border-border/40 bg-background/40 p-1">
            {["Ano", "Mes", "Semana", "Dia"].map((t, i) => (
              <button
                key={t}
                type="button"
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                  i === 0 ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
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
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", saldoCaixa >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
                    {saldoCaixa >= 0 ? "+" : ""}
                    {Math.abs((saldoCaixa / Math.max(financeiro.recebimentos.valor || 1, 1)) * 100).toFixed(1).replace(".", ",")}%
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
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fluxoSerieAcumulada} margin={{ top: 30, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="saldoFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} dy={6} />
                  <YAxis hide />
                  <Tooltip contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle} itemStyle={tooltipStyle.itemStyle} />
                  <Area
                    type="monotone"
                    dataKey="saldoAcumulado"
                    stroke="#3B82F6"
                    strokeWidth={4}
                    fill="url(#saldoFill)"
                  />
                  <ReferenceDot
                    x={ultimoPontoSaldo?.mes}
                    y={ultimoPontoSaldo?.saldoAcumulado}
                    r={5}
                    fill="#3B82F6"
                    stroke="var(--color-background)"
                    strokeWidth={3}
                    label={{
                      content: ({ viewBox }: { viewBox?: { x?: number; y?: number } }) => {
                        if (!viewBox || viewBox.x == null || viewBox.y == null) return null;
                        return (
                          <text
                            x={viewBox.x - 8}
                            y={viewBox.y - 14}
                            textAnchor="end"
                            fill="var(--color-foreground)"
                            fontSize={12}
                            fontWeight={700}
                          >
                            {ultimoSaldoLabel}
                          </text>
                        );
                      },
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </PanelCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PanelCard
          title="Faturamento por projeto"
          description="Distribuicao do periodo"
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
                  <Tooltip contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle} formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="text-xl font-semibold text-foreground">
                    {Math.round((projetoTopo?.fechado ?? 0) / Math.max(totalProjetos || 1, 1) * 100)}%
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {projetoTopo?.nome ?? "Projeto"}
                  </div>
                </div>
              </div>
            </div>

            <ul className="flex-1 space-y-2.5">
              {comercial.por_projeto.map((row, index) => {
                const pct = (row.fechado / Math.max(totalProjetos || 1, 1)) * 100;
                return (
                  <li key={row.codproj} className="flex items-center gap-3 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                    <span className="min-w-0 flex-1 truncate text-foreground">{row.nome}</span>
                    <span className="text-xs text-muted-foreground">{pct.toFixed(1).replace(".", ",")}%</span>
                    <span className="w-20 text-right text-xs font-medium text-foreground">
                      {formatCompactCurrency(row.fechado)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </PanelCard>

        <PanelCard
          title="Evolucao mensal"
          description="Entradas e saidas do caixa"
          className="overflow-hidden"
          bodyClassName="p-0"
        >
          <div className="h-[320px] w-full p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fluxoSerie} barCategoryGap={18} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
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
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompactCurrency(v as number)} width={44} />
                <Tooltip contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle} itemStyle={tooltipStyle.itemStyle} formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="entradas" fill="url(#entradaFill)" radius={[3, 3, 0, 0]} barSize={10} />
                <Bar dataKey="saidas" fill="url(#saidaFill)" radius={[3, 3, 0, 0]} barSize={10} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ReportListPanel
          title="Relatorios Vendas do Sankhya"
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
          title="Relatorios financeiros recebimentos"
          sub="Financeiro"
          rows={[
            {
              icon: ArrowUpRight,
              title: "Recebimentos",
              meta: "Baixas no periodo",
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
                    {formatInt(rateioSemRateio)} sem rateio
                  </Badge>
                )}
                {rateioIncompleto > 0 && (
                  <Badge variant="secondary" className="gap-1 bg-danger/15 text-danger">
                    <AlertTriangle className="h-3 w-3" />
                    {formatInt(rateioIncompleto)} incompleto
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
                  <TableHead className="hidden text-right md:table-cell">Despesas rateadas</TableHead>
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
                      <TableCell className="font-mono text-[11px] text-muted-foreground">{item.codigo}</TableCell>
                      <TableCell className="font-medium text-foreground">
                        {projeto?.DESCRPROJ ?? projeto?.IDENTIFICACAO ?? item.nome}
                      </TableCell>
                      <TableCell className="text-right text-foreground">{formatCompactCurrency(venda?.fechado ?? 0)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCompactCurrency(venda?.nota_venda ?? 0)}</TableCell>
                      <TableCell className="text-right text-danger/80">{formatCompactCurrency(venda?.cancelados ?? 0)}</TableCell>
                      <TableCell className="hidden text-right text-muted-foreground md:table-cell">
                        {rateio ? formatInt(rateio.despesas) : "—"}
                      </TableCell>
                      <TableCell className="hidden text-right md:table-cell">
                        {rateio ? (
                          <div>
                            <div className="font-semibold text-foreground">{formatCompactCurrency(rateio.valor_rateado)}</div>
                            <div className="text-[10px] text-muted-foreground">{formatPercent(rateio.percentual)} do rateio</div>
                          </div>
                        ) : "—"}
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
                <div key={item.mes} className="rounded-xl border border-border/40 bg-background/40 p-3">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{item.mes}</span>
                    <span className={cn("font-semibold", item.saldo >= 0 ? "text-success" : "text-danger")}>
                      {formatCompactCurrency(item.saldo)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <div className="h-1.5 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full bg-success" style={{ width: `${Math.min((item.entradas / total) * 100, 100)}%` }} />
                    </div>
                    <span className="w-20 text-right text-[11px] text-muted-foreground">{formatCompactCurrency(item.entradas)}</span>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full bg-danger" style={{ width: `${Math.min((item.saidas / total) * 100, 100)}%` }} />
                    </div>
                    <span className="w-20 text-right text-[11px] text-muted-foreground">{formatCompactCurrency(item.saidas)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </PanelCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AccountsPanel title="Contas a receber" data={financeiro.contas_receber.titulos} />
        <AccountsPanel title="Contas a pagar" data={financeiro.contas_pagar.titulos} />
      </div>

      <PanelCard title="Movimentos financeiros do periodo" description={`${financeiro.movimentos.length} registros`} bodyClassName="p-0">
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
                  <TableCell className="text-muted-foreground">{formatDate(row.data_baixa)}</TableCell>
                  <TableCell>
                    <span
                      className="border px-2 py-1 text-[10px] uppercase tracking-[0.14em]"
                      style={{
                        borderColor: row.tipo === "receber" ? "rgba(77,163,255,0.35)" : "rgba(224,85,85,0.35)",
                        color: row.tipo === "receber" ? "var(--color-chart-1)" : "var(--color-chart-4)",
                        background: row.tipo === "receber" ? "rgba(77,163,255,0.08)" : "rgba(224,85,85,0.08)",
                      }}
                    >
                      {row.tipo}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate font-medium text-foreground">{row.parceiro}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-muted-foreground">{row.natureza}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground">{row.projeto}</TableCell>
                  <TableCell className="text-right font-semibold text-foreground">{formatCurrency(row.valor)}</TableCell>
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
          <div key={row.title} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-md border" style={{ borderColor: `${row.color}55`, background: `${row.color}14`, color: row.color }}>
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
}: {
  title: string;
  data: ExecutivoDashboard["financeiro"]["contas_receber"]["titulos"];
}) {
  return (
    <PanelCard title={title} description="Carteira aberta" bodyClassName="p-0">
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
                <TableCell className="max-w-[220px] truncate font-medium text-foreground">{row.NOMEPARC ?? "Sem parceiro"}</TableCell>
                <TableCell className={cn(row.dias_atraso > 0 ? "font-semibold text-danger" : "text-muted-foreground")}>
                  {formatDate(row.DTVENC)}
                </TableCell>
                <TableCell className="max-w-[240px] truncate text-muted-foreground">{row.DESCRNAT ?? "Sem natureza"}</TableCell>
                <TableCell className="text-right font-semibold text-foreground">{formatCurrency(row.valor_aberto)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </PanelCard>
  );
}
