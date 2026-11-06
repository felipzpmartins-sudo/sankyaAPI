import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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

import { DetalheSheet, combinaBusca } from "@/components/dashboard/DetalheSheet";
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

type FiltroPedidos = "todos" | "com_nota" | "pendentes";
type SituacaoPedido = "faturado" | "parcial" | "sem_nota" | "encerrado";

type ListaPedidos = {
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
};

/** Qual lista está aberta no painel lateral. */
type Detalhe = FiltroPedidos | "vendedores";

const TITULO_DETALHE: Record<Detalhe, { titulo: string; descricao: string }> = {
  todos: {
    titulo: "Pedidos de venda",
    descricao: "Todos os pedidos de venda do período, do mais novo para o mais antigo.",
  },
  com_nota: {
    titulo: "Pedidos que viraram nota",
    descricao: "Pedidos com ao menos uma nota emitida — inclui os parcialmente faturados.",
  },
  pendentes: {
    titulo: "Pendentes no Sankhya",
    descricao: "Pedidos com saldo a faturar: sem nenhuma nota ou parcialmente faturados.",
  },
  vendedores: {
    titulo: "Vendedores com pedido",
    descricao: "Clique num vendedor para ver os pedidos dele.",
  },
};

const ROTULO_SITUACAO: Record<SituacaoPedido, { texto: string; classe: string }> = {
  faturado: { texto: "Faturado", classe: "text-success" },
  parcial: { texto: "Parcial", classe: "text-muted-foreground" },
  sem_nota: { texto: "Sem nota", classe: "text-warning" },
  encerrado: { texto: "Encerrado sem nota", classe: "text-muted-foreground" },
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

  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [busca, setBusca] = useState("");
  const [vendedorSel, setVendedorSel] = useState<string | null>(null);
  const filtroPedidos: FiltroPedidos | null =
    detalhe && detalhe !== "vendedores" ? detalhe : null;

  const lista = useQuery({
    queryKey: ["comercial-pedidos-lista", query, filtroPedidos],
    queryFn: () =>
      apiJson<ListaPedidos>("/api/dashboard/vendedores/pedidos", {
        ...query,
        situacao: filtroPedidos ?? "todos",
      }),
    enabled: filtroPedidos !== null,
    staleTime: 30_000,
  });

  const pedidosFiltrados = useMemo(
    () =>
      (lista.data?.pedidos ?? []).filter(
        (p) =>
          (!vendedorSel || (p.vendedor ?? "Sem vendedor") === vendedorSel) &&
          combinaBusca(busca, [p.NUNOTA, p.parceiro, p.vendedor, p.numero_nota]),
      ),
    [lista.data, busca, vendedorSel],
  );
  const valorFiltrado = pedidosFiltrados.reduce((soma, p) => soma + p.valor, 0);
  const vendedoresFiltrados = useMemo(
    () => (ranking.data?.vendedores ?? []).filter((v) => combinaBusca(busca, [v.vendedor])),
    [ranking.data, busca],
  );

  function abrirDetalhe(qual: Detalhe, vendedor: string | null = null) {
    setBusca("");
    setVendedorSel(vendedor);
    setDetalhe(qual);
  }

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
          onClick={() => abrirDetalhe("todos")}
        />
        <KpiCard
          label="Viraram nota"
          value={formatInt(dados.com_nota)}
          hint={`${conversao.toFixed(1)}% de conversão`}
          icon={Receipt}
          tone="success"
          onClick={() => abrirDetalhe("com_nota")}
        />
        <KpiCard
          label="Pendentes no Sankhya"
          value={formatInt(dados.pendentes)}
          hint={`${formatCurrency(dados.valor_pendente)} · ${formatInt(dados.sem_nota)} sem nota, ${formatInt(dados.parciais)} parciais`}
          icon={AlertTriangle}
          tone={dados.pendentes > 0 ? "warning" : "default"}
          critical={dados.sem_nota > 0}
          onClick={() => abrirDetalhe("pendentes")}
        />
        <KpiCard
          label="Vendedores com pedido"
          value={formatInt(ranking.data?.vendedores.length ?? 0)}
          hint="no período selecionado"
          icon={Users}
          onClick={() => abrirDetalhe("vendedores")}
        />
      </div>

      <DetalheSheet
        open={detalhe !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setDetalhe(null);
        }}
        titulo={
          detalhe
            ? vendedorSel && detalhe !== "vendedores"
              ? `${TITULO_DETALHE[detalhe].titulo} · ${vendedorSel}`
              : TITULO_DETALHE[detalhe].titulo
            : ""
        }
        descricao={detalhe ? TITULO_DETALHE[detalhe].descricao : undefined}
        busca={busca}
        onBusca={setBusca}
        placeholderBusca={
          detalhe === "vendedores"
            ? "Buscar vendedor..."
            : "Buscar por pedido, parceiro, vendedor ou número da nota..."
        }
        carregando={filtroPedidos !== null && lista.isPending}
        erro={filtroPedidos !== null && lista.error ? "Não foi possível carregar a lista." : null}
        rodape={
          detalhe === "vendedores" ? (
            <span>{formatInt(vendedoresFiltrados.length)} vendedores</span>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {formatInt(pedidosFiltrados.length)} pedidos ·{" "}
                <strong className="text-foreground">{formatCurrency(valorFiltrado)}</strong>
                {lista.data?.truncado && " · lista limitada aos 5.000 mais recentes"}
              </span>
              {vendedorSel && (
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => abrirDetalhe("vendedores")}
                >
                  ← Voltar aos vendedores
                </button>
              )}
            </div>
          )
        }
      >
        {detalhe === "vendedores" ? (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="text-[11px] uppercase text-muted-foreground">Vendedor</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Pedidos</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Valor</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Ticket</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Part.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendedoresFiltrados.length === 0 && <EmptyTableRow colSpan={5} />}
              {vendedoresFiltrados.map((v) => (
                <TableRow
                  key={v.CODVEND}
                  onClick={() => abrirDetalhe("todos", v.vendedor)}
                  className="cursor-pointer border-border/40 hover:bg-surface-elevated/60"
                >
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
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="text-[11px] uppercase text-muted-foreground">Pedido</TableHead>
                <TableHead className="text-[11px] uppercase text-muted-foreground">Data</TableHead>
                <TableHead className="text-[11px] uppercase text-muted-foreground">Parceiro</TableHead>
                <TableHead className="text-[11px] uppercase text-muted-foreground">Vendedor</TableHead>
                <TableHead className="text-[11px] uppercase text-muted-foreground">Situação</TableHead>
                <TableHead className="text-[11px] uppercase text-muted-foreground">Nota</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pedidosFiltrados.length === 0 && <EmptyTableRow colSpan={7} />}
              {pedidosFiltrados.map((p) => (
                <TableRow key={p.NUNOTA} className="border-border/40 hover:bg-surface-elevated/60">
                  <TableCell className="font-medium tabular-nums text-foreground">{p.NUNOTA}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(p.DTNEG ?? "")}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate text-foreground" title={p.parceiro ?? ""}>
                    {p.parceiro ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.vendedor ?? "Sem vendedor"}</TableCell>
                  <TableCell className={cn("whitespace-nowrap text-sm", ROTULO_SITUACAO[p.situacao].classe)}>
                    {ROTULO_SITUACAO[p.situacao].texto}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {p.nota == null ? (
                      "—"
                    ) : (
                      <span className="tabular-nums">
                        {p.numero_nota ?? p.nota}
                        {p.DTFATUR && (
                          <span className="ml-1 text-xs opacity-80">· {formatDate(p.DTFATUR)}</span>
                        )}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-foreground">
                    {formatCurrency(p.valor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetalheSheet>

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

        <PanelCard
          title="Detalhe por vendedor"
          description="Pedidos, valor e ticket médio · clique para ver os pedidos"
          bodyClassName="p-0"
        >
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
                <TableRow
                  key={v.CODVEND}
                  onClick={() => abrirDetalhe("todos", v.vendedor)}
                  title="Ver os pedidos deste vendedor"
                  className="cursor-pointer border-border/40 hover:bg-surface-elevated/60"
                >
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
