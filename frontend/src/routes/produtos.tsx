import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronDown,
  Download,
  Layers,
  LoaderCircle,
  PackageX,
  Package,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { DetalheSheet, combinaBusca } from "@/components/dashboard/DetalheSheet";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PanelCard } from "@/components/dashboard/PanelCard";
import { PeriodPresetToggle } from "@/components/dashboard/PeriodPresetToggle";
import { QueryState } from "@/components/dashboard/QueryState";
import { EmptyTableRow } from "@/components/dashboard/EmptyTableRow";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiBlob, apiJson, empresaQuery } from "@/lib/api";
import {
  barTooltipCursor,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
  chartTooltipStyle,
} from "@/lib/chart-style";
import { useFilters } from "@/lib/filters-context";
import { formatCompactCurrency, formatCurrency, formatDate, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

type Curva = "A" | "B" | "C";

type CurvaAbc = {
  total: number;
  resumo: Array<{ curva: Curva; produtos: number; valor: number; participacao_pct: number }>;
  produtos: Array<{
    CODPROD: number;
    produto: string;
    grupo: string | null;
    qtd: number;
    valor: number;
    participacao_pct: number;
    acumulado_pct: number;
    curva: Curva;
  }>;
};

type RankingProdutos = {
  total: number;
  mais_vendidos: Array<{ CODPROD: number; produto: string; qtd: number; valor: number }>;
  menos_vendidos: Array<{ CODPROD: number; produto: string; qtd: number; valor: number }>;
};

type PorProduto = {
  filtro: { codProd: number | null; curva: Curva | null; produto: string | null };
  total: number;
  vendedores: Array<{
    CODVEND: number;
    vendedor: string;
    qtd: number;
    valor: number;
    participacao_pct: number;
  }>;
};

type SemVenda = {
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
};

/** Quantos produtos entram no gráfico de Pareto antes de virar borrão. */
const PARETO_LIMITE = 25;

const CORES_CURVA: Record<Curva, string> = {
  A: "text-success",
  B: "text-warning",
  C: "text-muted-foreground",
};

export const Route = createFileRoute("/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos · Dashboards Sankhya" },
      {
        name: "description",
        content: "Curva ABC, produtos mais e menos vendidos e quem vende cada um.",
      },
    ],
  }),
  component: ProdutosPage,
});

function ProdutosPage() {
  const { filters, setFilters } = useFilters();
  const [curvaSelecionada, setCurvaSelecionada] = useState<Curva | null>(null);
  const [produtoSelecionado, setProdutoSelecionado] = useState<{ cod: number; nome: string } | null>(
    null,
  );

  const query = {
    empresa: empresaQuery(filters.empresas),
    dataInicio: filters.dataInicio,
    dataFim: filters.dataFim,
  };

  const [verTodosSemVenda, setVerTodosSemVenda] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  const [exportando, setExportando] = useState(false);

  const abc = useQuery({
    queryKey: ["produtos-curva-abc", query],
    queryFn: () => apiJson<CurvaAbc>("/api/dashboard/produtos/curva-abc", query),
    staleTime: 60_000,
  });
  const ranking = useQuery({
    queryKey: ["produtos-ranking", query],
    queryFn: () => apiJson<RankingProdutos>("/api/dashboard/produtos/ranking", query),
    staleTime: 60_000,
  });
  const porProduto = useQuery({
    queryKey: ["produtos-vendedores", query, curvaSelecionada, produtoSelecionado?.cod],
    queryFn: () =>
      apiJson<PorProduto>("/api/dashboard/vendedores/por-produto", {
        ...query,
        curva: produtoSelecionado ? undefined : curvaSelecionada ?? undefined,
        codProd: produtoSelecionado?.cod,
      }),
    staleTime: 60_000,
  });

  const semVenda = useQuery({
    queryKey: ["produtos-sem-venda", query],
    queryFn: () => apiJson<SemVenda>("/api/dashboard/produtos/sem-venda", query),
    staleTime: 60_000,
  });

  /** Lista aberta no painel lateral: catálogo inteiro ou uma curva. */
  const [detalhe, setDetalhe] = useState<"todos" | Curva | null>(null);
  const [buscaDetalhe, setBuscaDetalhe] = useState("");
  const produtosDetalhe = useMemo(
    () =>
      (abc.data?.produtos ?? []).filter(
        (p) =>
          (detalhe === "todos" || p.curva === detalhe) &&
          combinaBusca(buscaDetalhe, [p.CODPROD, p.produto, p.grupo]),
      ),
    [abc.data, detalhe, buscaDetalhe],
  );
  const valorDetalhe = produtosDetalhe.reduce((soma, p) => soma + p.valor, 0);

  function abrirDetalhe(qual: "todos" | Curva) {
    setBuscaDetalhe("");
    setDetalhe(qual);
  }

  async function exportarSemVenda() {
    setExportando(true);
    try {
      const blob = await apiBlob("/api/dashboard/produtos/sem-venda/exportacao", query);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `produtos-sem-venda-${filters.dataInicio}-a-${filters.dataFim}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } finally {
      setExportando(false);
    }
  }

  if (abc.isPending || abc.error) {
    return <QueryState loading={abc.isPending} error={abc.error} retry={() => void abc.refetch()} />;
  }

  const dados = abc.data;
  const listaSemVenda = (semVenda.data?.produtos ?? []).filter(
    (r) => verTodosSemVenda || r.parou_de_vender,
  );

  const pareto = dados.produtos.slice(0, PARETO_LIMITE).map((p) => ({
    ...p,
    curto: p.produto.length > 22 ? `${p.produto.slice(0, 22)}…` : p.produto,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Produtos</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Curva ABC e ranking
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Valor dos produtos nas notas emitidas, já com desconto e sem frete — kit conta uma vez.
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
          label="Faturamento por item"
          value={formatCompactCurrency(dados.total)}
          hint={`${formatInt(dados.produtos.length)} produtos com venda`}
          icon={Package}
          onClick={() => abrirDetalhe("todos")}
        />
        {dados.resumo.map((r) => (
          <KpiCard
            key={r.curva}
            label={`Curva ${r.curva}`}
            value={`${formatInt(r.produtos)} produtos`}
            hint={`${formatCurrency(r.valor)} · ${r.participacao_pct.toFixed(1)}%`}
            icon={Layers}
            tone={r.curva === "A" ? "success" : r.curva === "B" ? "warning" : "default"}
            onClick={() => abrirDetalhe(r.curva)}
          />
        ))}
      </div>

      <DetalheSheet
        open={detalhe !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setDetalhe(null);
        }}
        titulo={detalhe === "todos" ? "Produtos com venda" : `Curva ${detalhe ?? ""}`}
        descricao={
          detalhe === "todos"
            ? "Todos os produtos faturados no período, do maior para o menor."
            : detalhe === "A"
              ? "Produtos que somam os primeiros 80% do faturamento."
              : detalhe === "B"
                ? "Produtos entre 80% e 95% do faturamento acumulado."
                : "Produtos que formam os últimos 5% do faturamento."
        }
        busca={buscaDetalhe}
        onBusca={setBuscaDetalhe}
        placeholderBusca="Buscar por código, produto ou grupo..."
        rodape={
          <span>
            {formatInt(produtosDetalhe.length)} produtos ·{" "}
            <strong className="text-foreground">{formatCurrency(valorDetalhe)}</strong>
            {dados.total > 0 && ` · ${((valorDetalhe / dados.total) * 100).toFixed(1)}% do faturamento`}
          </span>
        }
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="text-[11px] uppercase text-muted-foreground">Código</TableHead>
              <TableHead className="text-[11px] uppercase text-muted-foreground">Produto</TableHead>
              <TableHead className="text-[11px] uppercase text-muted-foreground">Grupo</TableHead>
              <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Qtd</TableHead>
              <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Valor</TableHead>
              <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Part.</TableHead>
              <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Acum.</TableHead>
              {detalhe === "todos" && (
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Curva</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {produtosDetalhe.length === 0 && <EmptyTableRow colSpan={detalhe === "todos" ? 8 : 7} />}
            {produtosDetalhe.map((p) => (
              <TableRow key={p.CODPROD} className="border-border/40 hover:bg-surface-elevated/60">
                <TableCell className="tabular-nums text-muted-foreground">{p.CODPROD}</TableCell>
                <TableCell className="max-w-[300px] truncate text-foreground" title={p.produto}>
                  {p.produto}
                </TableCell>
                <TableCell className="max-w-[160px] truncate text-muted-foreground" title={p.grupo ?? ""}>
                  {p.grupo ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatInt(p.qtd)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums text-foreground">
                  {formatCurrency(p.valor)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {p.participacao_pct.toFixed(1)}%
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {p.acumulado_pct.toFixed(1)}%
                </TableCell>
                {detalhe === "todos" && (
                  <TableCell className={cn("text-right text-sm font-semibold", CORES_CURVA[p.curva])}>
                    {p.curva}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DetalheSheet>

      <PanelCard
        title="Curva ABC"
        description={`Barras = faturamento do produto · linha = acumulado · ${PARETO_LIMITE} maiores`}
        bodyClassName="p-0"
      >
        <div className="h-[380px] w-full px-2 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={pareto} margin={{ bottom: 64, right: 8 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" opacity={0.4} />
              <XAxis
                dataKey="curto"
                stroke="var(--color-muted-foreground)"
                fontSize={10}
                interval={0}
                angle={-38}
                textAnchor="end"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="valor"
                stroke="var(--color-muted-foreground)"
                fontSize={12}
                tickFormatter={(v) => formatCompactCurrency(v as number)}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="acumulado"
                orientation="right"
                domain={[0, 100]}
                stroke="var(--color-muted-foreground)"
                fontSize={12}
                tickFormatter={(v) => `${v}%`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                labelStyle={chartTooltipLabelStyle}
                itemStyle={chartTooltipItemStyle}
                cursor={barTooltipCursor}
                formatter={(v: number, nome: string) =>
                  nome === "Acumulado" ? `${v.toFixed(1)}%` : formatCurrency(v)
                }
              />
              <Bar
                yAxisId="valor"
                name="Faturamento"
                dataKey="valor"
                fill="var(--color-chart-1)"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="acumulado"
                name="Acumulado"
                type="monotone"
                dataKey="acumulado_pct"
                stroke="var(--color-success)"
                strokeWidth={2.5}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </PanelCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ListaProdutos
          titulo="Top 10 mais vendidos"
          descricao="Por faturamento no período"
          icone={<TrendingUp className="h-4 w-4 text-success" />}
          linhas={ranking.data?.mais_vendidos ?? []}
          selecionado={produtoSelecionado?.cod ?? null}
          onSelecionar={(cod, nome) =>
            setProdutoSelecionado((atual) => (atual?.cod === cod ? null : { cod, nome }))
          }
        />
        <ListaProdutos
          titulo="Top 10 menos vendidos"
          descricao="Entre os que tiveram alguma venda no período"
          icone={<TrendingDown className="h-4 w-4 text-muted-foreground" />}
          linhas={ranking.data?.menos_vendidos ?? []}
          selecionado={produtoSelecionado?.cod ?? null}
          onSelecionar={(cod, nome) =>
            setProdutoSelecionado((atual) => (atual?.cod === cod ? null : { cod, nome }))
          }
        />
      </div>

      <PanelCard
        title="Produtos ativos sem venda"
        description={
          semVenda.data
            ? "De " + formatInt(semVenda.data.total_ativos) + " produtos ativos no cadastro"
            : "Carregando..."
        }
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={exportando || !semVenda.data}
            onClick={() => void exportarSemVenda()}
          >
            {exportando ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Exportar Excel
          </Button>
        }
      >
        {semVenda.data && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Estatistica
                rotulo="Sem venda no período"
                valor={formatInt(semVenda.data.sem_venda)}
                nota="ativos que não faturaram nada"
                destaque
              />
              <Estatistica
                rotulo="Pararam de vender"
                valor={formatInt(semVenda.data.pararam_de_vender)}
                nota={"já venderam desde " + formatDate(semVenda.data.inicio_do_historico)}
              />
              <Estatistica
                rotulo="Com estoque em mãos"
                valor={formatInt(semVenda.data.com_estoque)}
                nota="estoque próprio, sem o que está com terceiros"
              />
            </div>

            <p className="text-xs leading-5 text-muted-foreground">
              Só produto marcado como ativo no Sankhya entra aqui — os inativos
              ficam de fora para o número não inflar com o que a empresa nem vende
              mais. Dos {formatInt(semVenda.data.sem_venda)} sem venda,{" "}
              <strong className="text-foreground">
                {formatInt(semVenda.data.nunca_na_janela)}
              </strong>{" "}
              nunca apareceram numa nota desde {formatDate(semVenda.data.inicio_do_historico)},
              que é onde o histórico do painel começa.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setListaAberta((a) => !a)}>
                <ChevronDown
                  className={cn(
                    "mr-2 h-4 w-4 transition-transform",
                    listaAberta && "rotate-180",
                  )}
                />
                {listaAberta ? "Ocultar lista" : "Ver lista"}
              </Button>
              {listaAberta && (
                <Button
                  size="sm"
                  variant={verTodosSemVenda ? "default" : "outline"}
                  onClick={() => setVerTodosSemVenda((v) => !v)}
                >
                  {verTodosSemVenda ? "Mostrando todos" : "Só os que pararam de vender"}
                </Button>
              )}
            </div>

            {listaAberta && (
              <div className="-mx-5 -mb-5 border-t border-border/50">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/60 hover:bg-transparent">
                      <TableHead className="text-[11px] uppercase text-muted-foreground">Código</TableHead>
                      <TableHead className="text-[11px] uppercase text-muted-foreground">Produto</TableHead>
                      <TableHead className="text-[11px] uppercase text-muted-foreground">Grupo</TableHead>
                      <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Estoque</TableHead>
                      <TableHead className="text-[11px] uppercase text-muted-foreground">Última venda</TableHead>
                      <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Sem vender</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listaSemVenda.length === 0 && <EmptyTableRow colSpan={6} />}
                    {listaSemVenda.map((r) => (
                      <TableRow key={r.CODPROD} className="border-border/40 hover:bg-surface-elevated/60">
                        <TableCell className="tabular-nums text-muted-foreground">{r.CODPROD}</TableCell>
                        <TableCell className="max-w-[320px] truncate text-foreground" title={r.produto}>
                          {r.produto}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.grupo ?? "—"}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            r.estoque > 0 ? "font-medium text-warning" : "text-muted-foreground",
                          )}
                        >
                          {formatInt(r.estoque)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.ultima_venda ? formatDate(r.ultima_venda) : "sem registro"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.dias_sem_vender == null ? "—" : formatInt(r.dias_sem_vender) + "d"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </PanelCard>
      <PanelCard
        title="Quem vende o quê"
        description={
          produtoSelecionado
            ? `Produto: ${produtoSelecionado.nome}`
            : curvaSelecionada
              ? `Curva ${curvaSelecionada} inteira`
              : "Catálogo inteiro — escolha uma curva ou clique num produto acima"
        }
        action={
          <div className="flex flex-wrap gap-1.5">
            {(["A", "B", "C"] as const).map((c) => (
              <Button
                key={c}
                size="sm"
                variant={curvaSelecionada === c && !produtoSelecionado ? "default" : "outline"}
                onClick={() => {
                  setProdutoSelecionado(null);
                  setCurvaSelecionada((atual) => (atual === c ? null : c));
                }}
              >
                Curva {c}
              </Button>
            ))}
            {(curvaSelecionada || produtoSelecionado) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCurvaSelecionada(null);
                  setProdutoSelecionado(null);
                }}
              >
                Limpar
              </Button>
            )}
          </div>
        }
        bodyClassName="p-0"
      >
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="text-[11px] uppercase text-muted-foreground">Vendedor</TableHead>
              <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Quantidade</TableHead>
              <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Valor</TableHead>
              <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Part.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(porProduto.data?.vendedores.length ?? 0) === 0 && <EmptyTableRow colSpan={4} />}
            {(porProduto.data?.vendedores ?? []).map((v) => (
              <TableRow key={v.CODVEND} className="border-border/40 hover:bg-surface-elevated/60">
                <TableCell className="text-foreground">{v.vendedor}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatInt(v.qtd)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums text-foreground">
                  {formatCurrency(v.valor)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {v.participacao_pct.toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PanelCard>

      <PanelCard title="Classificação completa" description="Todos os produtos com venda no período" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="text-[11px] uppercase text-muted-foreground">Produto</TableHead>
              <TableHead className="text-[11px] uppercase text-muted-foreground">Grupo</TableHead>
              <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Valor</TableHead>
              <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Acum.</TableHead>
              <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Curva</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dados.produtos.length === 0 && <EmptyTableRow colSpan={5} />}
            {dados.produtos.map((p) => (
              <TableRow key={p.CODPROD} className="border-border/40 hover:bg-surface-elevated/60">
                <TableCell className="max-w-[360px] truncate text-foreground" title={p.produto}>
                  {p.produto}
                </TableCell>
                <TableCell className="text-muted-foreground">{p.grupo ?? "—"}</TableCell>
                <TableCell className="text-right font-medium tabular-nums text-foreground">
                  {formatCurrency(p.valor)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {p.acumulado_pct.toFixed(1)}%
                </TableCell>
                <TableCell className={cn("text-right text-sm font-semibold", CORES_CURVA[p.curva])}>
                  {p.curva}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PanelCard>
    </div>
  );
}

function ListaProdutos({
  titulo,
  descricao,
  icone,
  linhas,
  selecionado,
  onSelecionar,
}: {
  titulo: string;
  descricao: string;
  icone: React.ReactNode;
  linhas: Array<{ CODPROD: number; produto: string; qtd: number; valor: number }>;
  selecionado: number | null;
  onSelecionar: (codProd: number, nome: string) => void;
}) {
  return (
    <PanelCard title={titulo} description={descricao} action={icone} bodyClassName="p-0">
      <Table>
        <TableHeader>
          <TableRow className="border-border/60 hover:bg-transparent">
            <TableHead className="text-[11px] uppercase text-muted-foreground">Produto</TableHead>
            <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Qtd</TableHead>
            <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.length === 0 && <EmptyTableRow colSpan={3} />}
          {linhas.map((p) => (
            <TableRow
              key={p.CODPROD}
              onClick={() => onSelecionar(p.CODPROD, p.produto)}
              className={cn(
                "cursor-pointer border-border/40 hover:bg-surface-elevated/60",
                selecionado === p.CODPROD && "bg-primary/10 hover:bg-primary/15",
              )}
            >
              <TableCell className="max-w-[280px] truncate text-foreground" title={p.produto}>
                {p.produto}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatInt(p.qtd)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums text-foreground">
                {formatCurrency(p.valor)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PanelCard>
  );
}

/**
 * Número solto dentro de um painel. Não é KpiCard porque não é um indicador
 * de topo de tela: são três recortes do mesmo total, e ficam juntos.
 */
function Estatistica({
  rotulo,
  valor,
  nota,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  nota: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        destaque ? "border-warning/30 bg-warning/5" : "border-border/50 bg-surface-elevated/40",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {rotulo}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", destaque ? "text-warning" : "text-foreground")}>
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>
    </div>
  );
}
