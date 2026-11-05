import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, FileText, Receipt, Target, Users } from "lucide-react";

import { KpiCard } from "@/components/dashboard/KpiCard";
import { PanelCard } from "@/components/dashboard/PanelCard";
import { PeriodPresetToggle } from "@/components/dashboard/PeriodPresetToggle";
import { QueryState } from "@/components/dashboard/QueryState";
import { EmptyTableRow } from "@/components/dashboard/EmptyTableRow";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiJson, empresaQuery } from "@/lib/api";
import {
  barTooltipCursor,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from "@/lib/chart-style";
import { useFilters } from "@/lib/filters-context";
import { formatCompactCurrency, formatCurrency, formatDate, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

type PedidosVsNota = {
  total_pedidos: number;
  com_nota: number;
  sem_nota: number;
  pendentes: number;
  parciais: number;
  valor_total: number;
  valor_sem_nota: number;
  valor_pendente: number;
  /** Só os pendentes no Sankhya (PENDENTE = 'S'). */
  pedidos: Array<{
    NUNOTA: number;
    parceiro: string | null;
    vendedor: string | null;
    valor: number;
    DTNEG: string | null;
    nota: number | null;
    DTFATUR: string | null;
    dias_em_aberto: number | null;
    parcial: boolean;
  }>;
};

type RankingVendedores = {
  total: number;
  vendedores: Array<{
    CODVEND: number;
    vendedor: string;
    pedidos: number;
    valor: number;
    ticket_medio: number;
    participacao_pct: number;
  }>;
};

export const Route = createFileRoute("/comercial")({
  head: () => ({
    meta: [
      { title: "Comercial · Dashboards Sankhya" },
      {
        name: "description",
        content:
          "Vendas pela ótica do vendedor: pedidos, conversão em nota e comparação entre a equipe.",
      },
    ],
  }),
  component: ComercialPage,
});

function ComercialPage() {
  const { filters, setFilters } = useFilters();
  const query = {
    empresa: empresaQuery(filters.empresas),
    dataInicio: filters.dataInicio,
    dataFim: filters.dataFim,
  };

  const pedidos = useQuery({
    queryKey: ["comercial-pedidos-vs-nota", query],
    queryFn: () => apiJson<PedidosVsNota>("/api/dashboard/vendedores/pedidos-vs-nota", query),
    staleTime: 30_000,
  });
  const ranking = useQuery({
    queryKey: ["comercial-ranking", query],
    queryFn: () => apiJson<RankingVendedores>("/api/dashboard/vendedores/ranking-geral", query),
    staleTime: 30_000,
  });

  if (pedidos.isPending || pedidos.error) {
    return (
      <QueryState
        loading={pedidos.isPending}
        error={pedidos.error}
        retry={() => void pedidos.refetch()}
      />
    );
  }

  const dados = pedidos.data;
  const conversao = dados.total_pedidos > 0 ? (dados.com_nota / dados.total_pedidos) * 100 : 0;
  const pendentes = dados.pedidos;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Comercial</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Vendas por vendedor
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pela ótica do pedido de venda — orçamento, comodato, bonificação e remessas ficam de fora.
          </p>
        </div>
        <PeriodPresetToggle
          dataInicio={filters.dataInicio}
          dataFim={filters.dataFim}
          onChange={(faixa) => setFilters(faixa)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Pedidos de venda"
          value={formatInt(dados.total_pedidos)}
          hint={formatCurrency(dados.valor_total)}
          icon={FileText}
        />
        <KpiCard
          label="Viraram nota"
          value={formatInt(dados.com_nota)}
          hint={`${conversao.toFixed(1)}% de conversão`}
          icon={Receipt}
          tone="success"
        />
        <KpiCard
          label="Pendentes no Sankhya"
          value={formatInt(dados.pendentes)}
          hint={`${formatCurrency(dados.valor_pendente)} · ${formatInt(dados.sem_nota)} sem nota, ${formatInt(dados.parciais)} parciais`}
          icon={AlertTriangle}
          tone={dados.pendentes > 0 ? "warning" : "default"}
          critical={dados.sem_nota > 0}
        />
        <KpiCard
          label="Vendedores com pedido"
          value={formatInt(ranking.data?.vendedores.length ?? 0)}
          hint="no período selecionado"
          icon={Users}
        />
      </div>

      <PanelCard
        title="Pedidos pendentes"
        description={`${formatInt(dados.sem_nota)} sem nenhuma nota (${formatCurrency(dados.valor_sem_nota)}) · ${formatInt(dados.parciais)} parcialmente faturados`}
        bodyClassName="p-0"
      >
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="text-[11px] uppercase text-muted-foreground">Pedido</TableHead>
              <TableHead className="text-[11px] uppercase text-muted-foreground">Parceiro</TableHead>
              <TableHead className="text-[11px] uppercase text-muted-foreground">Vendedor</TableHead>
              <TableHead className="text-[11px] uppercase text-muted-foreground">Data</TableHead>
              <TableHead className="text-[11px] uppercase text-muted-foreground">Situação</TableHead>
              <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Valor</TableHead>
              <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Em aberto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendentes.length === 0 && <EmptyTableRow colSpan={7} />}
            {pendentes.map((p) => (
              <TableRow key={p.NUNOTA} className="border-border/40 hover:bg-surface-elevated/60">
                <TableCell className="font-medium tabular-nums text-foreground">{p.NUNOTA}</TableCell>
                <TableCell className="max-w-[280px] truncate text-foreground" title={p.parceiro ?? ""}>
                  {p.parceiro ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{p.vendedor ?? "Sem vendedor"}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(p.DTNEG ?? "")}</TableCell>
                <TableCell className={cn("text-sm", p.parcial ? "text-muted-foreground" : "text-warning")}>
                  {p.parcial ? "Parcial" : "Sem nota"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums text-foreground">
                  {formatCurrency(p.valor)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right text-sm tabular-nums",
                    (p.dias_em_aberto ?? 0) > 30
                      ? "font-semibold text-danger"
                      : (p.dias_em_aberto ?? 0) > 7
                        ? "text-warning"
                        : "text-muted-foreground",
                  )}
                >
                  {p.dias_em_aberto == null ? "—" : `${p.dias_em_aberto}d`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PanelCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PanelCard
          title="Comparação entre vendedores"
          description="Valor de pedido no período"
          bodyClassName="p-0"
        >
          <div className="h-[320px] w-full px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={(ranking.data?.vendedores ?? []).slice(0, 10)}
                layout="vertical"
                margin={{ left: 12, right: 16 }}
              >
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" opacity={0.4} horizontal={false} />
                <XAxis
                  type="number"
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickFormatter={(v) => formatCompactCurrency(v as number)}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="vendedor"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  width={132}
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
                <Bar dataKey="valor" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>

        <PanelCard title="Detalhe por vendedor" description="Pedidos, valor e ticket médio" bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="text-[11px] uppercase text-muted-foreground">Vendedor</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Pedidos</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Valor</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Ticket</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Part.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(ranking.data?.vendedores.length ?? 0) === 0 && <EmptyTableRow colSpan={5} />}
              {(ranking.data?.vendedores ?? []).map((v) => (
                <TableRow key={v.CODVEND} className="border-border/40 hover:bg-surface-elevated/60">
                  <TableCell className="text-foreground">{v.vendedor}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatInt(v.pedidos)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-foreground">
                    {formatCurrency(v.valor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(v.ticket_medio)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {v.participacao_pct.toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PanelCard>
      </div>

      <PanelCard
        title="Meta x realizado"
        description="Aguardando cadastro das metas no Sankhya"
      >
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3.5">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-sm leading-6 text-muted-foreground">
            <p className="font-medium text-foreground">Nenhuma meta cadastrada no ERP.</p>
            <p className="mt-1">
              O módulo de metas do Sankhya está instalado com três configurações
              (vendedor, grupo de produtos e produto), mas as tabelas de valor
              estão vazias. Assim que o gerente cadastrar as metas por vendedor,
              este painel passa a mostrar barra de progresso e quebra semanal sem
              precisar de alteração aqui.
            </p>
          </div>
        </div>
      </PanelCard>
    </div>
  );
}
