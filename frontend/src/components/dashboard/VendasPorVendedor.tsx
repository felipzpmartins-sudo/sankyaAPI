import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Target } from "lucide-react";
import { useState } from "react";

import { EmptyTableRow } from "@/components/dashboard/EmptyTableRow";
import { MetasDialog, buscarMetas } from "@/components/dashboard/MetasDialog";
import { PanelCard } from "@/components/dashboard/PanelCard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiJson } from "@/lib/api";
import { formatCurrency, formatDate, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

type Agrupamento = "mes" | "semana";

type Celula = { pedidos: number; valor: number; meta: number | null; atingido_pct: number | null };

type VendasPorPeriodo = {
  agrupamento: Agrupamento;
  colunas: Array<{ chave: string; inicio: string; fim: string }>;
  vendedores: Array<{ CODVEND: number; vendedor: string; celulas: Celula[]; total: Celula }>;
  totais: { celulas: Celula[]; total: Celula };
};

function rotuloColuna(
  coluna: { chave: string; inicio: string; fim: string },
  agrupamento: Agrupamento,
) {
  if (agrupamento === "mes") {
    const [ano, mes] = coluna.chave.split("-").map(Number);
    const nome = new Date(ano, mes - 1, 1)
      .toLocaleDateString("pt-BR", { month: "short" })
      .replace(".", "");
    return `${nome}/${String(ano).slice(2)}`;
  }
  return `${formatDate(coluna.inicio).slice(0, 5)}–${formatDate(coluna.fim).slice(0, 5)}`;
}

/** Verde bateu a meta, amarelo passou de 70%, vermelho abaixo disso. */
function tomDaMeta(pct: number) {
  if (pct >= 100) return { texto: "text-success", barra: "bg-success" };
  if (pct >= 70) return { texto: "text-warning", barra: "bg-warning" };
  return { texto: "text-danger", barra: "bg-danger" };
}

function CelulaVenda({ celula, destaque = false }: { celula: Celula; destaque?: boolean }) {
  const semVenda = celula.pedidos === 0 && celula.valor === 0;
  const tom = celula.atingido_pct != null ? tomDaMeta(celula.atingido_pct) : null;

  return (
    <div
      className="flex flex-col items-end gap-0.5"
      title={celula.meta != null ? `Meta: ${formatCurrency(celula.meta)}` : undefined}
    >
      <span
        className={cn(
          "tabular-nums",
          destaque ? "font-semibold text-foreground" : "font-medium text-foreground",
          semVenda && "font-normal text-muted-foreground/60",
        )}
      >
        {semVenda ? "—" : formatCurrency(celula.valor)}
      </span>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {formatInt(celula.pedidos)} {celula.pedidos === 1 ? "pedido" : "pedidos"}
      </span>
      {tom && celula.atingido_pct != null && (
        <div className="flex w-full min-w-[84px] items-center justify-end gap-1.5">
          <div className="h-1 w-12 overflow-hidden rounded-full bg-border/60">
            <div
              className={cn("h-full rounded-full", tom.barra)}
              style={{ width: `${Math.min(100, celula.atingido_pct)}%` }}
            />
          </div>
          <span className={cn("text-[11px] font-medium tabular-nums", tom.texto)}>
            {celula.atingido_pct.toFixed(0)}%
          </span>
        </div>
      )}
      {destaque && celula.meta != null && (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          meta {formatCurrency(celula.meta)}
        </span>
      )}
    </div>
  );
}

/**
 * Quanto cada vendedor vendeu em cada mês (ou semana) do período, com valor,
 * número de pedidos e o quanto da meta já foi batido. Segue o filtro global
 * de empresa, vendedor e período.
 */
export function VendasPorVendedor({
  query,
  onVendedor,
}: {
  query: { empresa: string; vendedor: string; dataInicio: string; dataFim: string };
  onVendedor?: (vendedor: string) => void;
}) {
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("mes");
  const [metasAbertas, setMetasAbertas] = useState(false);
  const mesDaMeta = query.dataFim.slice(0, 7);

  const vendas = useQuery({
    queryKey: ["comercial-vendas-periodo", query, agrupamento],
    queryFn: () =>
      apiJson<VendasPorPeriodo>("/api/dashboard/vendedores/vendas-periodo", {
        ...query,
        agrupamento,
      }),
    staleTime: 30_000,
  });
  // Só para saber se esta conta grava meta; o formulário busca de novo ao abrir.
  const permissao = useQuery({
    queryKey: ["comercial-metas", mesDaMeta],
    queryFn: () => buscarMetas(mesDaMeta),
    staleTime: 60_000,
  });

  const dados = vendas.data;
  const colunas = dados?.colunas ?? [];
  const temMeta = dados?.totais.total.meta != null;

  return (
    <PanelCard
      title={
        agrupamento === "mes"
          ? "Vendas por vendedor, mês a mês"
          : "Vendas por vendedor, semana a semana"
      }
      description={
        agrupamento === "mes"
          ? "Valor e número de pedidos de venda em cada mês do período, contra a meta do mês · clique no vendedor para ver os pedidos"
          : "Semanas de segunda a domingo. A meta da semana é a meta do mês dividida pelos dias do mês"
      }
      bodyClassName="p-0"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={agrupamento}
            onValueChange={(v) => v && setAgrupamento(v as Agrupamento)}
            className="rounded-full border border-border/40 bg-surface p-1"
          >
            {(
              [
                ["mes", "Mês"],
                ["semana", "Semana"],
              ] as const
            ).map(([valor, rotulo]) => (
              <ToggleGroupItem
                key={valor}
                value={valor}
                className="h-7 rounded-full px-3 text-xs text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {rotulo}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button variant="outline" size="sm" onClick={() => setMetasAbertas(true)}>
            <Target />
            {permissao.data?.pode_editar === false ? "Ver metas" : "Definir metas"}
          </Button>
        </div>
      }
    >
      {vendas.isPending ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : vendas.error ? (
        <div className="p-5 text-sm text-danger">
          Não foi possível carregar as vendas por vendedor.
        </div>
      ) : (
        <>
          {!temMeta && (
            <div className="flex items-center gap-2 border-b border-border/50 bg-warning/5 px-5 py-2.5 text-xs text-muted-foreground">
              <Target className="h-3.5 w-3.5 shrink-0 text-warning" />
              Nenhuma meta cadastrada para estes meses. Use "Definir metas" para lançar a meta de
              cada vendedor.
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 hover:bg-transparent">
                  <TableHead className="sticky left-0 z-10 min-w-[160px] bg-surface text-[11px] uppercase text-muted-foreground">
                    Vendedor
                  </TableHead>
                  {colunas.map((c) => (
                    <TableHead
                      key={c.chave}
                      className="whitespace-nowrap text-right text-[11px] uppercase text-muted-foreground"
                    >
                      {rotuloColuna(c, agrupamento)}
                    </TableHead>
                  ))}
                  <TableHead className="whitespace-nowrap bg-surface-elevated/40 text-right text-[11px] uppercase text-foreground">
                    Total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(dados?.vendedores.length ?? 0) === 0 && (
                  <EmptyTableRow colSpan={colunas.length + 2} />
                )}
                {dados?.vendedores.map((v) => (
                  <TableRow
                    key={v.CODVEND}
                    onClick={onVendedor ? () => onVendedor(v.vendedor) : undefined}
                    title={onVendedor ? "Ver os pedidos deste vendedor" : undefined}
                    className={cn(
                      "border-border/40 hover:bg-surface-elevated/60",
                      onVendedor && "cursor-pointer",
                    )}
                  >
                    <TableCell className="sticky left-0 z-10 bg-surface align-top text-foreground">
                      {v.vendedor}
                    </TableCell>
                    {v.celulas.map((c, i) => (
                      <TableCell key={colunas[i].chave} className="align-top">
                        <CelulaVenda celula={c} />
                      </TableCell>
                    ))}
                    <TableCell className="bg-surface-elevated/40 align-top">
                      <CelulaVenda celula={v.total} destaque />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {dados && dados.vendedores.length > 0 && (
                <TableFooter className="border-border/60 bg-surface-elevated/30">
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="sticky left-0 z-10 bg-surface align-top font-semibold text-foreground">
                      Total
                    </TableCell>
                    {dados.totais.celulas.map((c, i) => (
                      <TableCell key={colunas[i].chave} className="align-top">
                        <CelulaVenda celula={c} destaque />
                      </TableCell>
                    ))}
                    <TableCell className="bg-surface-elevated/40 align-top">
                      <CelulaVenda celula={dados.totais.total} destaque />
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </>
      )}

      <MetasDialog open={metasAbertas} onOpenChange={setMetasAbertas} mesInicial={mesDaMeta} />
    </PanelCard>
  );
}
