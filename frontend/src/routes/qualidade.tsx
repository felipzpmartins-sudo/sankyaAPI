import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderKanban,
  Info,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { KpiCard } from "@/components/dashboard/KpiCard";
import { PanelCard } from "@/components/dashboard/PanelCard";
import { QueryState } from "@/components/dashboard/QueryState";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRateioDashboard } from "@/hooks/use-dashboard-data";
import { usePageSnapshot } from "@/lib/snapshot-context";
import { EmptyTableRow } from "@/components/dashboard/EmptyTableRow";
import { useFilters } from "@/lib/filters-context";
import { formatCurrency, formatDate, formatInt, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/qualidade")({
  head: () => ({
    meta: [
      { title: "Qualidade do Dado · Dashboards Sankhya" },
      {
        name: "description",
        content:
          "Diagnóstico de rateio: lançamentos sem rateio ou com rateio incompleto e impacto no resultado.",
      },
    ],
  }),
  component: QualidadePage,
});

const COM_RATEIO_PAGE_SIZE = 20;
type PeriodPreset = "semana" | "mes" | "ano" | "periodo";

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

function QualidadePage() {
  const { filters, setFilters } = useFilters();
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(() => inferPreset(filters.dataInicio, filters.dataFim));
  const [comRateioPage, setComRateioPage] = useState(0);
  const empresaFilterKey = filters.empresas.join(",");
  const projetoFilterKey = filters.projetos.join(",");
  useEffect(() => {
    if (periodPreset !== "periodo" && !matchesRange(periodPreset, filters.dataInicio, filters.dataFim)) {
      setPeriodPreset("periodo");
    }
  }, [filters.dataInicio, filters.dataFim, periodPreset]);
  useEffect(() => {
    setComRateioPage(0);
  }, [filters.dataInicio, filters.dataFim, empresaFilterKey, projetoFilterKey]);
  const query = useRateioDashboard(filters, comRateioPage, COM_RATEIO_PAGE_SIZE);
  usePageSnapshot(query.data?.snapshot_at);
  if (query.isPending || query.error) {
    return <QueryState loading={query.isPending} error={query.error} retry={() => void query.refetch()} />;
  }
  const rateioResumo = query.data.resumo;
  const comRateio = query.data.com_rateio ?? [];
  const comRateioMeta = query.data.com_rateio_page ?? {
    page: 0,
    pageSize: COM_RATEIO_PAGE_SIZE,
    total: 0,
  };
  const semRateio = query.data.sem_rateio;
  const rateioIncompleto = query.data.rateio_incompleto;
  const rateioPorProjeto = query.data.rateio_por_projeto ?? [];
  const titulosSemProjeto = rateioResumo.titulos_sem_projeto ?? 0;
  const valorSemProjeto = rateioResumo.valor_sem_projeto ?? 0;
  const valorRateadoTotal = rateioResumo.valor_rateado_total ?? 0;
  const pctOk = rateioResumo.total_titulos > 0
    ? (rateioResumo.com_rateio_ok / rateioResumo.total_titulos) * 100
    : 0;
  const impactoTotal = rateioResumo.valor_sem_rateio + valorSemProjeto;
  const semRateioOrdenado = [...semRateio].sort((a, b) => b.valor - a.valor);
  const incompletoOrdenado = [...rateioIncompleto].sort((a, b) => b.valor - a.valor);
  const comRateioPaginas = Math.max(1, Math.ceil(comRateioMeta.total / comRateioMeta.pageSize));
  const comRateioInicio = comRateioMeta.total === 0 ? 0 : comRateioMeta.page * comRateioMeta.pageSize + 1;
  const comRateioFim = Math.min((comRateioMeta.page + 1) * comRateioMeta.pageSize, comRateioMeta.total);

  function exportarCsv() {
    const rows = [...semRateioOrdenado, ...incompletoOrdenado];
    const header = ["NUFIN", "Fornecedor", "Valor", "Data", "Projeto", "Percentual valido", "Alerta", "Status"];
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const content = [
      header.join(";"),
      ...rows.map((row) => [
        row.nufin,
        row.parceiro,
        row.valor,
        row.data,
        row.projeto,
        row.percentual_valido ?? row.total_perc,
        row.alerta,
        row.status,
      ].map(escape).join(";")),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `diagnostico-rateio-${filters.dataInicio}-${filters.dataFim}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function applyPeriodPreset(preset: PeriodPreset) {
    setPeriodPreset(preset);
    if (preset !== "periodo") {
      setFilters(presetRange(preset, filters.dataFim));
    }
  }

  return (
    <div className="space-y-6">
      {query.data.status !== "OK" && (
        <PanelCard title="Rateio ainda não sincronizado" description="Diagnóstico temporariamente indisponível">
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-foreground">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <p>{query.data.mensagem}</p>
          </div>
        </PanelCard>
      )}
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
            ["periodo", "Período"],
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Com rateio"
          value={formatInt(rateioResumo.com_rateio_ok)}
          hint={`${formatPercent(pctOk)} de ${formatInt(rateioResumo.total_titulos)} despesas`}
          tone="success"
          icon={CheckCircle2}
        />
        <KpiCard
          label="Sem rateio"
          value={String(rateioResumo.sem_rateio)}
          hint={formatCurrency(rateioResumo.valor_sem_rateio)}
          tone="warning"
          icon={AlertTriangle}
          critical={rateioResumo.sem_rateio > 0}
        />
        <KpiCard
          label="Rateio incompleto"
          value={String(rateioResumo.rateio_incompleto)}
          hint={formatCurrency(rateioResumo.valor_rateio_incompleto)}
          tone={rateioResumo.rateio_incompleto > 0 ? "danger" : "success"}
          icon={rateioResumo.rateio_incompleto > 0 ? XCircle : CheckCircle2}
          critical={rateioResumo.rateio_incompleto > 0}
        />
        <KpiCard
          label="Projeto não informado"
          value={String(titulosSemProjeto)}
          hint={formatCurrency(valorSemProjeto)}
          tone={titulosSemProjeto > 0 ? "warning" : "success"}
          critical={titulosSemProjeto > 0}
          icon={FolderKanban}
        />
      </div>

      <PanelCard
        title="Rateio aplicado por projeto"
        description={`${formatCurrency(valorRateadoTotal)} distribuídos nas despesas do período`}
      >
        {rateioPorProjeto.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/30 p-4 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            Nenhuma distribuição por projeto encontrada no período selecionado.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span><strong className="text-foreground">{formatInt(rateioResumo.com_rateio_ok)}</strong> despesas com rateio válido</span>
              <span><strong className="text-foreground">{formatInt(rateioPorProjeto.length)}</strong> projetos com valor distribuído</span>
              <span>Participação calculada sobre o valor rateado</span>
            </div>
            <div className="space-y-3">
              {rateioPorProjeto.map((row) => (
                <div key={row.codproj} className="border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
                  <div className="flex items-start justify-between gap-4 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{row.projeto}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{row.codproj}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold text-foreground">{formatCurrency(row.valor_rateado)}</div>
                      <div className="text-[11px] text-muted-foreground">{formatPercent(row.percentual)}</div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/60">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${Math.min(Math.max(row.percentual, 0), 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {formatInt(row.despesas)} despesas · {formatInt(row.linhas)} linhas de rateio
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </PanelCard>

      {/* Painel de impacto */}
      <PanelCard title="Painel de impacto" description="Estimativa de efeito no resultado por projeto nas despesas">
        <div className={cn(
          "flex flex-col gap-3 rounded-lg border p-4 text-sm text-foreground",
          impactoTotal > 0.01 ? "border-warning/30 bg-warning/5" : "border-success/30 bg-success/5",
        )}>
          <div className="flex items-start gap-3">
            <div className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
              impactoTotal > 0.01 ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
            )}>
              {impactoTotal > 0.01 ? <Info className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            </div>
            <div className="space-y-2">
              {impactoTotal > 0.01 ? (
                <>
                  <p>
                    Existem <strong className="text-warning">{formatCurrency(impactoTotal)}</strong> sem
                    destino de projeto: despesas sem rateio ou parcelas lançadas no projeto 0.
                  </p>
                  <p className="text-muted-foreground">
                    Os 5 maiores lançamentos sem rateio concentram{" "}
                    <strong className="text-foreground">
                      {formatCurrency(
                        semRateioOrdenado.slice(0, 5).reduce((s, r) => s + r.valor, 0),
                      )}
                    </strong>{" "}
                    do total sem rateio.
                  </p>
                </>
              ) : (
                <p>As despesas do período estão distribuídas em projetos válidos, sem impacto de rateio pendente.</p>
              )}
              <p className="text-muted-foreground">
                Rateio incompleto considera a parcela em projetos válidos diferente de 100%; linhas de 0% não são tratadas como problema.
              </p>
            </div>
          </div>
        </div>
      </PanelCard>

      {/* Tabela detalhamento */}
      <PanelCard
        title="Detalhamento por lançamento"
        description="Conferência das despesas com rateio, sem rateio e com distribuição incompleta"
        action={
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-border/70 bg-surface"
            onClick={exportarCsv}
            disabled={semRateioOrdenado.length + incompletoOrdenado.length === 0}
          >
            <Download className="h-3.5 w-3.5" /> Exportar pendências
          </Button>
        }
        bodyClassName="p-0"
      >
        <Tabs defaultValue="com" className="w-full">
          <div className="overflow-x-auto border-b border-border/50 px-5 pt-3">
            <TabsList className="w-max bg-surface-elevated">
              <TabsTrigger value="com" className="gap-2">
                Com Rateio
                <Badge variant="secondary" className="bg-success/20 text-success">
                  {formatInt(comRateioMeta.total)}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="sem" className="gap-2">
                Sem Rateio
                <Badge variant="secondary" className="bg-warning/20 text-warning">
                  {semRateioOrdenado.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="incompleto" className="gap-2">
                Rateio Incompleto
                <Badge
                  variant="secondary"
                  className={rateioResumo.rateio_incompleto > 0 ? "bg-danger/20 text-danger" : "bg-success/20 text-success"}
                >
                  {incompletoOrdenado.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="com" className="m-0">
            <Table className="min-w-[1500px]">
              <TableHeader>
                <TableRow className="border-border/60 hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase text-muted-foreground">NUFIN</TableHead>
                  <TableHead className="min-w-[260px] text-[11px] uppercase text-muted-foreground">Empresa / fornecedor</TableHead>
                  <TableHead className="min-w-[190px] text-[11px] uppercase text-muted-foreground">Valores do título</TableHead>
                  <TableHead className="min-w-[160px] text-[11px] uppercase text-muted-foreground">Datas</TableHead>
                  <TableHead className="min-w-[250px] text-[11px] uppercase text-muted-foreground">Centro / natureza</TableHead>
                  <TableHead className="min-w-[390px] text-[11px] uppercase text-muted-foreground">Composição do rateio</TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comRateio.length === 0 && <EmptyTableRow colSpan={7} message="Nenhuma despesa com rateio neste período." />}
                {comRateio.map((r) => (
                  <TableRow key={r.nufin} className="border-border/40 hover:bg-surface-elevated/60">
                    <TableCell className="align-top">
                      <div className="font-mono text-xs text-foreground">{r.nufin}</div>
                      <div className="mt-1 text-[10px] uppercase text-muted-foreground">{r.tipo}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="line-clamp-2 font-medium text-foreground">{r.parceiro ?? "Sem fornecedor"}</div>
                      <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {r.empresa ?? `Empresa ${r.codemp}`}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">CODEMP {r.codemp}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Título</span>
                          <span className="font-semibold text-foreground">{formatCurrency(r.valor)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Baixado</span>
                          <span className="text-foreground">{formatCurrency(r.valor_baixado)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Em aberto</span>
                          <span className={r.valor_aberto > 0.01 ? "font-medium text-warning" : "text-muted-foreground"}>
                            {formatCurrency(r.valor_aberto)}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1 text-xs">
                        <div><span className="text-muted-foreground">Negociação:</span> <span className="text-foreground">{formatDate(r.data)}</span></div>
                        <div><span className="text-muted-foreground">Vencimento:</span> <span className="text-foreground">{formatDate(r.vencimento)}</span></div>
                        <div><span className="text-muted-foreground">Baixa:</span> <span className="text-foreground">{formatDate(r.baixa)}</span></div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-2 text-xs">
                        <div>
                          <div className="line-clamp-2 font-medium text-foreground">{r.centro_resultado ?? "Centro não informado"}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">Cód. {r.codcencus ?? "—"}</div>
                        </div>
                        <div>
                          <div className="line-clamp-2 text-foreground">{r.natureza ?? "Natureza não informada"}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">Cód. {r.codnat ?? "—"}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1.5">
                        {(r.distribuicao ?? []).map((item, index) => (
                          <div
                            key={`${r.nufin}-${item.codproj}-${index}`}
                            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium text-foreground">{item.projeto ?? `Projeto ${item.codproj}`}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">{item.codproj}</div>
                            </div>
                            <span className="font-semibold text-success">{formatPercent(item.percentual)}</span>
                            <span className="w-24 text-right text-muted-foreground">{formatCurrency(item.valor)}</span>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1.5">
                        <Badge variant="secondary" className="bg-success/20 text-success">
                          Com rateio
                        </Badge>
                        <div className="whitespace-nowrap text-[10px] text-muted-foreground">
                          {formatPercent(r.total_perc ?? 100)} distribuído
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-5 py-3">
              <span className="text-xs text-muted-foreground">
                Exibindo {formatInt(comRateioInicio)}–{formatInt(comRateioFim)} de {formatInt(comRateioMeta.total)}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Página {formatInt(comRateioMeta.page + 1)} de {formatInt(comRateioPaginas)}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  aria-label="Página anterior"
                  title="Página anterior"
                  disabled={comRateioMeta.page === 0 || query.isFetching}
                  onClick={() => setComRateioPage((page) => Math.max(0, page - 1))}
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
                  disabled={comRateioMeta.page + 1 >= comRateioPaginas || query.isFetching}
                  onClick={() => setComRateioPage((page) => page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sem" className="m-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase text-muted-foreground">NUFIN</TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">Fornecedor</TableHead>
                  <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Valor</TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">Data</TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">Projeto</TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {semRateioOrdenado.length === 0 && <EmptyTableRow colSpan={6} message="Nenhum título sem rateio neste período." />}
                {semRateioOrdenado.map((r) => (
                  <TableRow key={r.nufin} className="border-border/40 hover:bg-surface-elevated/60">
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.nufin}</TableCell>
                    <TableCell className="text-foreground">{r.parceiro}</TableCell>
                    <TableCell className="text-right font-semibold text-foreground">
                      {formatCurrency(r.valor)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.data)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.projeto}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-warning/20 text-warning">
                        Sem rateio
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="incompleto" className="m-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase text-muted-foreground">NUFIN</TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">Fornecedor</TableHead>
                  <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Valor</TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">Data</TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">Projeto</TableHead>
                  <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Σ %</TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incompletoOrdenado.length === 0 && <EmptyTableRow colSpan={7} message="Nenhuma despesa com rateio incompleto: os percentuais válidos somam 100%." />}
                {incompletoOrdenado.map((r) => (
                  <TableRow key={r.nufin} className="border-border/40 hover:bg-surface-elevated/60">
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.nufin}</TableCell>
                    <TableCell className="text-foreground">{r.parceiro}</TableCell>
                    <TableCell className="text-right font-semibold text-foreground">
                      {formatCurrency(r.valor)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.data)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <div>{r.projeto}</div>
                      {r.alerta && <div className="mt-0.5 text-[10px] text-warning">{r.alerta}</div>}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-danger">
                      {r.percentual_valido ?? r.total_perc}%
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-danger/20 text-danger">
                        Incompleto
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
