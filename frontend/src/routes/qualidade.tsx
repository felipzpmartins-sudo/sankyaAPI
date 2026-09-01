import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderKanban,
  Info,
  LoaderCircle,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { EmptyTableRow } from "@/components/dashboard/EmptyTableRow";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PanelCard } from "@/components/dashboard/PanelCard";
import { QueryState } from "@/components/dashboard/QueryState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type RateioItem, useRateioDashboard } from "@/hooks/use-dashboard-data";
import { apiBlob } from "@/lib/api";
import { useFilters } from "@/lib/filters-context";
import { formatCurrency, formatDate, formatInt, formatPercent } from "@/lib/format";
import { usePageSnapshot } from "@/lib/snapshot-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/qualidade")({
  head: () => ({
    meta: [
      { title: "Rateio por projeto · Dashboards Sankhya" },
      {
        name: "description",
        content:
          "Diagnóstico das despesas distribuídas para uma ou mais empresas e das pendências.",
      },
    ],
  }),
  component: QualidadePage,
});

const RATEIO_PAGE_SIZE = 20;

const ABAS = ["com", "sem", "incompleto"] as const;
type Aba = (typeof ABAS)[number];
type PeriodPreset = "semana" | "mes" | "ano" | "periodo";
type PageMeta = { page: number; pageSize: number; total: number };

function iso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function presetRange(preset: Exclude<PeriodPreset, "periodo">, dataFim: string) {
  const end = parseIso(dataFim);
  if (preset === "semana") {
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return { dataInicio: iso(start), dataFim };
  }
  if (preset === "mes") {
    return { dataInicio: iso(new Date(end.getFullYear(), end.getMonth(), 1)), dataFim };
  }
  return { dataInicio: `${end.getFullYear()}-01-01`, dataFim };
}

function matchesRange(
  preset: Exclude<PeriodPreset, "periodo">,
  dataInicio: string,
  dataFim: string,
) {
  const range = presetRange(preset, dataFim);
  return range.dataInicio === dataInicio && range.dataFim === dataFim;
}

function inferPreset(dataInicio: string, dataFim: string): PeriodPreset {
  if (matchesRange("semana", dataInicio, dataFim)) return "semana";
  if (matchesRange("mes", dataInicio, dataFim)) return "mes";
  if (matchesRange("ano", dataInicio, dataFim)) return "ano";
  return "periodo";
}

function RateioValidoTable({
  items,
  meta,
  isFetching,
  onPageChange,
}: {
  items: RateioItem[];
  meta: PageMeta;
  isFetching: boolean;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  const first = meta.total === 0 ? 0 : meta.page * meta.pageSize + 1;
  const last = Math.min((meta.page + 1) * meta.pageSize, meta.total);
  const statusLabel = "Com rateio";

  return (
    <>
      <Table className="min-w-[1500px]">
        <TableHeader>
          <TableRow className="border-border/60 hover:bg-transparent">
            <TableHead className="text-[11px] uppercase text-muted-foreground">NUFIN</TableHead>
            <TableHead className="min-w-[260px] text-[11px] uppercase text-muted-foreground">
              Empresa / fornecedor
            </TableHead>
            <TableHead className="min-w-[190px] text-[11px] uppercase text-muted-foreground">
              Valores do título
            </TableHead>
            <TableHead className="min-w-[160px] text-[11px] uppercase text-muted-foreground">
              Datas
            </TableHead>
            <TableHead className="min-w-[250px] text-[11px] uppercase text-muted-foreground">
              Centro / natureza
            </TableHead>
            <TableHead className="min-w-[390px] text-[11px] uppercase text-muted-foreground">
              Empresa de destino (projeto)
            </TableHead>
            <TableHead className="text-[11px] uppercase text-muted-foreground">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && (
            <EmptyTableRow
              colSpan={7}
              message="Nenhuma despesa com rateio neste período."
            />
          )}
          {items.map((row) => (
            <TableRow key={row.nufin} className="border-border/40 hover:bg-surface-elevated/60">
              <TableCell className="align-top">
                <div className="font-mono text-xs text-foreground">{row.nufin}</div>
                <div className="mt-1 text-[10px] uppercase text-muted-foreground">{row.tipo}</div>
              </TableCell>
              <TableCell className="align-top">
                <div className="line-clamp-2 font-medium text-foreground">
                  {row.parceiro ?? "Sem fornecedor"}
                </div>
                <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {row.empresa ?? `Empresa ${row.codemp}`}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  CODEMP {row.codemp}
                </div>
              </TableCell>
              <TableCell className="align-top">
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Título</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(row.valor)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Baixado</span>
                    <span className="text-foreground">{formatCurrency(row.valor_baixado)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Em aberto</span>
                    <span
                      className={
                        row.valor_aberto > 0.01
                          ? "font-medium text-warning"
                          : "text-muted-foreground"
                      }
                    >
                      {formatCurrency(row.valor_aberto)}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="align-top">
                <div className="space-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Negociação:</span>{" "}
                    <span className="text-foreground">{formatDate(row.data)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vencimento:</span>{" "}
                    <span className="text-foreground">{formatDate(row.vencimento)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Baixa:</span>{" "}
                    <span className="text-foreground">{formatDate(row.baixa)}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="align-top">
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="line-clamp-2 font-medium text-foreground">
                      {row.centro_resultado ?? "Centro não informado"}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      Cód. {row.codcencus ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className="line-clamp-2 text-foreground">
                      {row.natureza ?? "Natureza não informada"}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      Cód. {row.codnat ?? "—"}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="align-top">
                <div className="space-y-1.5">
                  {(row.distribuicao ?? []).map((item, index) => (
                    <div
                      key={`${row.nufin}-${item.codproj}-${index}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">
                          {item.projeto ?? `Projeto ${item.codproj}`}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {item.codproj ?? "Sem projeto"}
                        </div>
                      </div>
                      <span
                        className="font-semibold text-success"
                      >
                        {formatPercent(item.percentual)}
                      </span>
                      <span className="w-24 text-right text-muted-foreground">
                        {formatCurrency(item.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              </TableCell>
              <TableCell className="align-top">
                <div className="space-y-1.5">
                  <Badge
                    variant="secondary"
                    className="bg-success/20 text-success"
                  >
                    {statusLabel}
                  </Badge>
                  <div className="whitespace-nowrap text-[10px] text-muted-foreground">
                    {row.distribuicao?.length ?? 1}{" "}
                    {(row.distribuicao?.length ?? 1) === 1 ? "empresa" : "empresas"} ·{" "}
                    {formatPercent(row.total_perc ?? 100)}
                  </div>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-5 py-3">
        <span className="text-xs text-muted-foreground">
          Exibindo {formatInt(first)}–{formatInt(last)} de {formatInt(meta.total)}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Página {formatInt(meta.page + 1)} de {formatInt(pages)}
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            aria-label="Página anterior"
            title="Página anterior"
            disabled={meta.page === 0 || isFetching}
            onClick={() => onPageChange(Math.max(0, meta.page - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            aria-label="Próxima página"
            title="Próxima página"
            disabled={meta.page + 1 >= pages || isFetching}
            onClick={() => onPageChange(meta.page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

function QualidadePage() {
  const { filters, setFilters } = useFilters();
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(() =>
    inferPreset(filters.dataInicio, filters.dataFim),
  );
  const [comRateioPage, setComRateioPage] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [buscaTexto, setBuscaTexto] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [aba, setAba] = useState<Aba>("com");
  const empresaFilterKey = filters.empresas.join(",");
  const projetoFilterKey = filters.projetos.join(",");

  useEffect(() => {
    if (
      periodPreset !== "periodo" &&
      !matchesRange(periodPreset, filters.dataInicio, filters.dataFim)
    ) {
      setPeriodPreset("periodo");
    }
  }, [filters.dataInicio, filters.dataFim, periodPreset]);

  // Espera a digitacao parar antes de consultar: quem cola um NUFIN nao
  // deveria disparar seis requisicoes pelo caminho.
  useEffect(() => {
    const id = window.setTimeout(() => setBuscaAplicada(buscaTexto.trim()), 350);
    return () => window.clearTimeout(id);
  }, [buscaTexto]);

  useEffect(() => {
    setComRateioPage(0);
  }, [filters.dataInicio, filters.dataFim, empresaFilterKey, projetoFilterKey, buscaAplicada]);

  // A categoria de destino unico foi unificada em "com rateio"; a lista
  // separada segue no contrato da API, sempre vazia, e nao e mais paginada.
  const query = useRateioDashboard(filters, comRateioPage, 0, RATEIO_PAGE_SIZE, buscaAplicada);
  usePageSnapshot(query.data?.snapshot_at);

  // Buscar um NUFIN e cair numa aba vazia parece 'nao encontrado'. Quando ha
  // resultado em outra aba, a tela vai ate ele.
  const resumoAtual = query.data?.status === "OK" ? query.data.resumo : undefined;
  const comRateioTotal = query.data?.com_rateio_page?.total ?? 0;
  useEffect(() => {
    if (!buscaAplicada || !resumoAtual) return;
    const contagem: Record<Aba, number> = {
      com: comRateioTotal,
      sem: resumoAtual.sem_rateio,
      incompleto: resumoAtual.rateio_incompleto,
    };
    if (contagem[aba] > 0) return;
    const proxima = ABAS.find((chave) => contagem[chave] > 0);
    if (proxima) setAba(proxima);
  }, [buscaAplicada, resumoAtual, comRateioTotal, aba]);

  if (query.isPending || query.error) {
    return (
      <QueryState
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  }

  if (query.data.status !== "OK") {
    return (
      <div className="space-y-6">
        <PanelCard
          title="Rateio ainda não sincronizado"
          description="Diagnóstico temporariamente indisponível"
        >
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-foreground">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <p>{query.data.mensagem}</p>
          </div>
        </PanelCard>
      </div>
    );
  }

  const rateioResumo = query.data.resumo;
  const comRateio = query.data.com_rateio ?? [];
  const comRateioMeta = query.data.com_rateio_page ?? {
    page: 0,
    pageSize: RATEIO_PAGE_SIZE,
    total: 0,
  };
  const semRateio = query.data.sem_rateio ?? [];
  const rateioIncompleto = query.data.rateio_incompleto ?? [];
  const rateioPorProjeto = query.data.rateio_por_projeto ?? [];
  const buscaAusente = query.data.busca_ausente ?? null;
  const titulosSemProjeto = rateioResumo.titulos_sem_projeto ?? 0;
  const valorSemProjeto = rateioResumo.valor_sem_projeto ?? 0;
  const valorRateadoTotal = rateioResumo.valor_rateado_total ?? 0;
  const pctComRateio =
    rateioResumo.total_titulos > 0
      ? (rateioResumo.com_rateio_ok / rateioResumo.total_titulos) * 100
      : 0;
  const impactoTotal = rateioResumo.valor_sem_rateio + rateioResumo.valor_rateio_incompleto;
  const semRateioOrdenado = [...semRateio].sort((a, b) => b.valor - a.valor);
  const incompletoOrdenado = [...rateioIncompleto].sort((a, b) => b.valor - a.valor);
  const pendenciasOrdenadas = [...semRateio, ...rateioIncompleto].sort((a, b) => b.valor - a.valor);

  async function exportarExcel() {
    setExportando(true);
    setExportError(null);
    try {
      const blob = await apiBlob("/api/dashboard/financeiro/rateio-exportacao", {
        dataInicio: filters.dataInicio,
        dataFim: filters.dataFim,
        codEmp: filters.empresas.length > 0 ? filters.empresas.join(",") : undefined,
        codProj: filters.projetos.length > 0 ? filters.projetos.join(",") : undefined,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rateio-completo-${filters.dataInicio}-${filters.dataFim}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Não foi possível gerar o Excel.");
    } finally {
      setExportando(false);
    }
  }

  function applyPeriodPreset(preset: PeriodPreset) {
    setPeriodPreset(preset);
    if (preset !== "periodo") {
      setFilters(presetRange(preset, filters.dataFim));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-start sm:justify-end">
        <ToggleGroup
          type="single"
          value={periodPreset}
          aria-label="Filtrar período do rateio"
          className="rounded-full border border-border/40 bg-surface p-1"
          onValueChange={(value) => value && applyPeriodPreset(value as PeriodPreset)}
        >
          {[
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Com rateio"
          value={formatInt(rateioResumo.com_rateio_ok)}
          hint={`${formatPercent(pctComRateio)} · distribuição fecha 100%`}
          tone="success"
          icon={CheckCircle2}
        />
        <KpiCard
          label="Sem distribuição"
          value={formatInt(rateioResumo.sem_rateio)}
          hint={formatCurrency(rateioResumo.valor_sem_rateio)}
          tone="warning"
          icon={AlertTriangle}
          critical={rateioResumo.sem_rateio > 0}
        />
        <KpiCard
          label="Distribuição incompleta"
          value={formatInt(rateioResumo.rateio_incompleto)}
          hint={formatCurrency(rateioResumo.valor_rateio_incompleto)}
          tone={rateioResumo.rateio_incompleto > 0 ? "danger" : "success"}
          icon={rateioResumo.rateio_incompleto > 0 ? XCircle : CheckCircle2}
          critical={rateioResumo.rateio_incompleto > 0}
        />
      </div>

      <PanelCard
        title="Rateio aplicado por empresa de destino"
        description={`${formatCurrency(valorRateadoTotal)} em despesas distribuídas entre duas ou mais empresas`}
      >
        {rateioPorProjeto.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/30 p-4 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            Nenhuma despesa dividida entre empresas foi encontrada no período selecionado.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span>
                <strong className="text-foreground">{formatInt(rateioResumo.com_rateio_ok)}</strong>{" "}
                despesas com rateio
              </span>
              <span>
                <strong className="text-foreground">{formatInt(rateioPorProjeto.length)}</strong>{" "}
                empresas de destino
              </span>
              <span>Os códigos de projeto identificam a empresa de destino de cada parcela</span>
            </div>
            <div className="space-y-3">
              {rateioPorProjeto.map((row) => (
                <div
                  key={row.codproj}
                  className="border-b border-border/40 pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-start justify-between gap-4 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{row.projeto}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {row.codproj}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold text-foreground">
                        {formatCurrency(row.valor_rateado)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatPercent(row.percentual)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/60">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${Math.min(Math.max(row.percentual, 0), 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {formatInt(row.despesas)} despesas · {formatInt(row.linhas)} parcelas
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </PanelCard>

      <PanelCard
        title="Painel de impacto"
        description="Pendências que podem distorcer o resultado por empresa"
      >
        <div
          className={cn(
            "flex flex-col gap-3 rounded-lg border p-4 text-sm text-foreground",
            impactoTotal > 0.01
              ? "border-warning/30 bg-warning/5"
              : "border-success/30 bg-success/5",
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                impactoTotal > 0.01 ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
              )}
            >
              {impactoTotal > 0.01 ? (
                <Info className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
            </div>
            <div className="space-y-2">
              {impactoTotal > 0.01 ? (
                <>
                  <p>
                    Existem <strong className="text-warning">{formatCurrency(impactoTotal)}</strong>{" "}
                    em despesas sem distribuição ou com percentuais incompletos.
                  </p>
                  <p className="text-muted-foreground">
                    Os 5 maiores lançamentos pendentes concentram{" "}
                    <strong className="text-foreground">
                      {formatCurrency(
                        pendenciasOrdenadas.slice(0, 5).reduce((sum, row) => sum + row.valor, 0),
                      )}
                    </strong>{" "}
                    do total dessa pendência.
                  </p>
                </>
              ) : (
                <p>Não existem despesas com pendência de distribuição no período.</p>
              )}
              {titulosSemProjeto > 0 && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <FolderKanban className="h-4 w-4 shrink-0 text-warning" />
                  {formatInt(titulosSemProjeto)} títulos possuem percentual fora das empresas de
                  destino válidas, somando {formatCurrency(valorSemProjeto)}.
                </p>
              )}
              <p className="text-muted-foreground">
                Um único projeto de destino somando 100% já é rateio válido: significa que a
                despesa ficou inteira com uma empresa.
              </p>
            </div>
          </div>
        </div>
      </PanelCard>

      {exportError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
        >
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {exportError}
        </div>
      )}

      <PanelCard
        title="Detalhamento por lançamento"
        description="Um projeto de destino somando 100% já conta como rateio, seja uma empresa ou várias. Pendências ficam separadas."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={buscaTexto}
                onChange={(evento) => setBuscaTexto(evento.target.value)}
                placeholder="Código Sankhya, nota ou fornecedor"
                aria-label="Buscar lançamento pelo código do Sankhya"
                className="h-8 w-56 border-border/70 bg-surface pl-8 pr-8 text-xs sm:w-72"
              />
              {buscaTexto && (
                <button
                  type="button"
                  onClick={() => setBuscaTexto("")}
                  aria-label="Limpar busca"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-border/70 bg-surface"
              onClick={() => void exportarExcel()}
              disabled={exportando || rateioResumo.total_titulos === 0}
              title="Exportar todos os títulos e parcelas do período"
            >
              {exportando ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {exportando ? "Gerando Excel..." : "Exportar Excel completo"}
            </Button>
          </div>
        }
        bodyClassName="p-0"
      >
        <Tabs value={aba} onValueChange={(valor) => setAba(valor as Aba)} className="w-full">
          <div className="overflow-x-auto border-b border-border/50 px-5 pt-3">
            <TabsList className="w-max bg-surface-elevated">
              <TabsTrigger value="com" className="gap-2">
                Com rateio
                <Badge variant="secondary" className="bg-success/20 text-success">
                  {formatInt(comRateioMeta.total)}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="sem" className="gap-2">
                Sem distribuição
                <Badge variant="secondary" className="bg-warning/20 text-warning">
                  {formatInt(rateioResumo.sem_rateio)}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="incompleto" className="gap-2">
                Distribuição incompleta
                <Badge
                  variant="secondary"
                  className={
                    rateioResumo.rateio_incompleto > 0
                      ? "bg-danger/20 text-danger"
                      : "bg-success/20 text-success"
                  }
                >
                  {formatInt(rateioResumo.rateio_incompleto)}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </div>


          {buscaAplicada && (
            <div
              className="flex items-start gap-2 border-b border-border/50 bg-surface-elevated/60 px-5 py-3 text-xs text-muted-foreground"
              role={buscaAusente ? "alert" : undefined}
            >
              {buscaAusente ? (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              ) : (
                <Search className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <p>
                {buscaAusente ? (
                  <>
                    <span className="font-medium text-foreground">
                      Nada para “{buscaAplicada}” neste recorte.
                    </span>
                    <span> {buscaAusente.motivo}</span>
                  </>
                ) : (
                  <>
                    <span>Mostrando apenas lançamentos que casam com </span>
                    <span className="font-medium text-foreground">“{buscaAplicada}”</span>
                    <span>. Os contadores das abas seguem a busca.</span>
                  </>
                )}
              </p>
            </div>
          )}
          <TabsContent value="com" className="m-0 overflow-x-auto">
            <RateioValidoTable
              items={comRateio}
              meta={comRateioMeta}
              isFetching={query.isFetching}
              onPageChange={setComRateioPage}
            />
          </TabsContent>

          <TabsContent value="sem" className="m-0 overflow-x-auto">
            <Table className="min-w-[1750px]">
              <TableHeader>
                <TableRow className="border-border/60 hover:bg-transparent">
                  <TableHead className="whitespace-nowrap text-[11px] uppercase text-muted-foreground">NUFIN</TableHead>
                  <TableHead className="whitespace-nowrap text-[11px] uppercase text-muted-foreground">Nota</TableHead>
                  <TableHead className="whitespace-nowrap text-[11px] uppercase text-muted-foreground">Fornecedor</TableHead>
                  <TableHead className="whitespace-nowrap text-[11px] uppercase text-muted-foreground">Histórico</TableHead>
                  <TableHead className="whitespace-nowrap text-[11px] uppercase text-muted-foreground">Empresa</TableHead>
                  <TableHead className="whitespace-nowrap text-[11px] uppercase text-muted-foreground">Natureza</TableHead>
                  <TableHead className="whitespace-nowrap text-[11px] uppercase text-muted-foreground text-right">Valor</TableHead>
                  <TableHead className="whitespace-nowrap text-[11px] uppercase text-muted-foreground text-right">Baixado</TableHead>
                  <TableHead className="whitespace-nowrap text-[11px] uppercase text-muted-foreground">Negociação</TableHead>
                  <TableHead className="whitespace-nowrap text-[11px] uppercase text-muted-foreground">Vencimento</TableHead>
                  <TableHead className="whitespace-nowrap text-[11px] uppercase text-muted-foreground">Baixa</TableHead>
                  <TableHead className="whitespace-nowrap text-[11px] uppercase text-muted-foreground">Projeto do título</TableHead>
                  <TableHead className="whitespace-nowrap text-[11px] uppercase text-muted-foreground">Rateado (Sankhya)</TableHead>
                  <TableHead className="whitespace-nowrap text-[11px] uppercase text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {semRateioOrdenado.length === 0 && (
                  <EmptyTableRow
                    colSpan={14}
                    message="Nenhum título sem distribuição neste período."
                  />
                )}
                {semRateioOrdenado.map((row) => (
                  <TableRow
                    key={row.nufin}
                    className="border-border/40 hover:bg-surface-elevated/60"
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">{row.nufin}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {row.numnota ? `${row.numnota}${row.serienota ? "/" + row.serienota : ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-foreground">{row.parceiro ?? "Sem fornecedor"}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-muted-foreground" title={row.historico ?? ""}>
                      {row.historico ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{row.empresa ?? row.codemp}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {row.natureza ?? "—"}{row.codnat ? ` (${row.codnat})` : ""}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-foreground">{formatCurrency(row.valor)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(row.valor_baixado)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(row.data)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(row.vencimento)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {row.baixa ? formatDate(row.baixa) : "Em aberto"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.projeto ?? "Não informado"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          row.rateado_sankhya === "S"
                            ? "bg-danger/20 text-danger"
                            : "bg-surface-elevated text-muted-foreground"
                        }
                      >
                        {row.rateado_sankhya === "S" ? "S — diverge" : row.rateado_sankhya ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-warning/20 text-warning">
                        Sem distribuição
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="incompleto" className="m-0 overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="border-border/60 hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase text-muted-foreground">
                    NUFIN
                  </TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">
                    Fornecedor
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase text-muted-foreground">
                    Valor
                  </TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">
                    Data
                  </TableHead>
                  <TableHead className="min-w-[280px] text-[11px] uppercase text-muted-foreground">
                    Empresa de destino (projeto)
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase text-muted-foreground">
                    Σ %
                  </TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incompletoOrdenado.length === 0 && (
                  <EmptyTableRow
                    colSpan={7}
                    message="Nenhuma distribuição incompleta: os percentuais válidos somam 100%."
                  />
                )}
                {incompletoOrdenado.map((row) => (
                  <TableRow
                    key={row.nufin}
                    className="border-border/40 hover:bg-surface-elevated/60"
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.nufin}
                    </TableCell>
                    <TableCell className="text-foreground">
                      {row.parceiro ?? "Sem fornecedor"}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-foreground">
                      {formatCurrency(row.valor)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(row.data)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <div>{row.projeto ?? "Não informado"}</div>
                      {row.alerta && (
                        <div className="mt-0.5 text-[10px] text-warning">{row.alerta}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-danger">
                      {formatPercent(row.percentual_valido ?? row.total_perc ?? 0)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-danger/20 text-danger">
                        Incompleta
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </PanelCard>
    </div>
  );
}
