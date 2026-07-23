import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, KeyRound } from "lucide-react";

import { AnalyticsKpi } from "@/components/dashboard/AnalyticsKpi";
import { QueryState } from "@/components/dashboard/QueryState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiJson, empresaQuery } from "@/lib/api";
import { useFilters, type GlobalFilters } from "@/lib/filters-context";
import { formatCompactCurrency, formatCurrency, formatDate, formatInt, formatPercent } from "@/lib/format";

type Kind = "text" | "currency" | "int" | "percent" | "date" | "status";
type Metric = { label: string; value: string; delta?: number | null };
type Column = { key: string; label: string; kind?: Kind };
type Row = Record<string, unknown>;
type ModuleView = {
  title: string;
  description: string;
  metrics: Metric[];
  columns: Column[];
  rows: Row[];
  snapshotAt?: string | null;
  notice?: string;
  setup?: { account: string; issuer: string; manualKey: string; qrCodeUrl: string };
};

type Json = Record<string, any>;

const SUPPORTED = new Set([
  "dashboard", "empresas", "produtos", "vendedores", "compras",
  "clientes", "viacerta", "rh", "configuracao",
]);

export const Route = createFileRoute("/modulos/$modulo")({
  head: () => ({ meta: [{ title: "Módulos · Dashboards Sankhya" }] }),
  component: ModulePage,
});

function metric(label: string, value: string, delta?: number | null): Metric {
  return { label, value, delta };
}

function cell(value: unknown, kind: Kind = "text"): string {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "currency") return formatCurrency(Number(value));
  if (kind === "int") return formatInt(Number(value));
  if (kind === "percent") return formatPercent(Number(value));
  if (kind === "date") return formatDate(String(value));
  if (kind === "status") {
    const labels: Record<string, string> = { prazo: "No prazo", atrasado: "Atrasado", transito: "Em trânsito" };
    return labels[String(value)] ?? String(value);
  }
  return String(value);
}

async function moduleView(modulo: string, filters: GlobalFilters): Promise<ModuleView> {
  const empresa = empresaQuery(filters.empresas);
  const data = filters.dataFim;

  if (modulo === "dashboard") {
    const [clientes, rh, comodato] = await Promise.all([
      apiJson<Json>("/api/dashboard/clientes"),
      apiJson<Json>("/api/dashboard/rh"),
      apiJson<Json>("/api/dashboard/empresa/comodato", { empresa }),
    ]);
    return {
      title: "Visão Executiva",
      description: "Indicadores consolidados de clientes, pessoas, financeiro e ativos em comodato.",
      metrics: [
        metric("Receita no ano", formatCompactCurrency(clientes.receita_ano)),
        metric("Clientes compradores", formatInt(clientes.compradores_ano)),
        metric("Vendedores ativos", formatInt(rh.vendedores_ativos)),
        metric("Clientes na base", formatInt(clientes.total_clientes)),
        metric("Valores a receber", formatCompactCurrency(clientes.receber_aberto)),
        metric("Comodato ativo", formatCompactCurrency(comodato.saldo_ativo)),
      ],
      columns: [
        { key: "NOMEPARC", label: "Cliente" }, { key: "receita", label: "Receita", kind: "currency" },
        { key: "pedidos", label: "Pedidos", kind: "int" }, { key: "ticket_medio", label: "Ticket medio", kind: "currency" },
        { key: "ultima_compra", label: "Última compra", kind: "date" }, { key: "receber_aberto", label: "Em aberto", kind: "currency" },
      ],
      rows: (clientes.top_clientes ?? []).slice(0, 10),
      snapshotAt: clientes.snapshot_at,
    };
  }

  if (modulo === "empresas") {
    const response = await apiJson<Json>("/api/dashboard/empresa/faturamento-por-empresa", { periodo: "ano", data });
    const empresas = response.empresas ?? [];
    return {
      title: "Empresas",
      description: "Distribuição do faturamento entre as unidades do Grupo MKR.",
      metrics: [
        metric("Faturamento total", formatCompactCurrency(response.total)),
        metric("Empresas com venda", formatInt(empresas.filter((item: Json) => item.faturamento > 0).length)),
        metric("Maior participação", formatPercent(empresas[0]?.percentual ?? 0)),
      ],
      columns: [
        { key: "CODEMP", label: "Código", kind: "int" }, { key: "NOMEFANTASIA", label: "Empresa" },
        { key: "faturamento", label: "Faturamento", kind: "currency" }, { key: "percentual", label: "Participação", kind: "percent" },
      ],
      rows: empresas,
      snapshotAt: response.snapshot_at,
    };
  }

  if (modulo === "produtos") {
    const response = await apiJson<Json>("/api/dashboard/produtos");
    const produtos: Json[] = response.produtos ?? [];
    const ativos = produtos.filter((item) => item.ativo === 1);
    const marcas = new Set(ativos.map((item) => item.MARCA).filter(Boolean));
    const grupos = new Set(ativos.map((item) => item.GRUPO_DESCR).filter(Boolean));
    return {
      title: "Produtos",
      description: "Catálogo de produtos sincronizado com o Sankhya.",
      metrics: [
        metric("Produtos cadastrados", formatInt(produtos.length)),
        metric("Produtos ativos", formatInt(ativos.length)),
        metric("Marcas", formatInt(marcas.size)),
        metric("Grupos", formatInt(grupos.size)),
      ],
      columns: [
        { key: "CODPROD", label: "Código", kind: "int" }, { key: "DESCRPROD", label: "Produto" },
        { key: "MARCA", label: "Marca" }, { key: "GRUPO_DESCR", label: "Grupo" },
        { key: "REFERENCIA", label: "Referência" }, { key: "CODVOL", label: "Unidade" },
      ],
      rows: ativos.slice(0, 30),
      snapshotAt: produtos[0]?.synced_at,
    };
  }

  if (modulo === "vendedores") {
    const response = await apiJson<Json>("/api/dashboard/vendedores/ranking", { periodo: "ano", data });
    const ranking: Json[] = response.ranking ?? [];
    return {
      title: "Vendedores",
      description: "Ranking e produtividade comercial no período selecionado.",
      metrics: [
        metric("Faturamento", formatCompactCurrency(response.total)),
        metric("Vendedores com venda", formatInt(ranking.filter((item) => item.faturamento > 0).length)),
        metric("Notas emitidas", formatInt(ranking.reduce((sum, item) => sum + Number(item.qtd_notas ?? 0), 0))),
      ],
      columns: [
        { key: "APELIDO", label: "Vendedor" }, { key: "qtd_notas", label: "Notas", kind: "int" },
        { key: "ticket_medio", label: "Ticket médio", kind: "currency" },
        { key: "faturamento", label: "Faturamento", kind: "currency" }, { key: "percentual", label: "Participação", kind: "percent" },
      ],
      rows: ranking.filter((item) => item.faturamento > 0),
      snapshotAt: response.snapshot_at,
    };
  }

  if (modulo === "compras") {
    const response = await apiJson<Json>("/api/dashboard/financeiro/contas", { empresa, tipo: "pagar", page: 0, pageSize: 100 });
    const titulos: Json[] = response.titulos ?? [];
    return {
      title: "Compras e Fornecedores",
      description: "Visão financeira das obrigações em aberto associadas a fornecedores e despesas.",
      metrics: [
        metric("Títulos em aberto", formatInt(response.total)),
        metric("Valor em aberto", formatCompactCurrency(response.valor_total_aberto)),
        metric("Vencidos na página", formatInt(titulos.filter((item) => item.dias_atraso > 0).length)),
      ],
      columns: [
        { key: "NOMEPARC", label: "Fornecedor / Parceiro" }, { key: "DESCRNAT", label: "Natureza" },
        { key: "DTVENC", label: "Vencimento", kind: "date" }, { key: "dias_atraso", label: "Dias atraso", kind: "int" },
        { key: "valor_aberto", label: "Valor aberto", kind: "currency" },
      ],
      rows: titulos,
      snapshotAt: response.snapshot_at,
      notice: "Este módulo usa contas a pagar do Sankhya; pedidos de compra ainda não fazem parte do snapshot.",
    };
  }

  if (modulo === "clientes") {
    const response = await apiJson<Json>("/api/dashboard/clientes");
    return {
      title: "Clientes",
      description: "Base comercial, receita, recorrência e exposição financeira dos clientes.",
      metrics: [
        metric("Clientes na base", formatInt(response.total_clientes)), metric("Compradores no ano", formatInt(response.compradores_ano)),
        metric("Receita no ano", formatCompactCurrency(response.receita_ano)), metric("Ticket médio", formatCompactCurrency(response.ticket_medio)),
        metric("A receber", formatCompactCurrency(response.receber_aberto)), metric("Receber vencido", formatCompactCurrency(response.receber_vencido)),
      ],
      columns: [
        { key: "NOMEPARC", label: "Cliente" }, { key: "receita", label: "Receita", kind: "currency" },
        { key: "pedidos", label: "Pedidos", kind: "int" }, { key: "ticket_medio", label: "Ticket médio", kind: "currency" },
        { key: "ultima_compra", label: "Última compra", kind: "date" }, { key: "receber_aberto", label: "Em aberto", kind: "currency" },
      ],
      rows: response.top_clientes ?? [],
      snapshotAt: response.snapshot_at,
    };
  }

  if (modulo === "viacerta") {
    const month = data.slice(5, 7);
    const year = data.slice(0, 4);
    let response: Json;
    try {
      response = await apiJson<Json>("/api/viacerta/alunos-ativos", { month, year });
    } catch {
      return {
        title: "Alunos Via Certa",
        description: `Alunos ativos e consumo de aulas em ${month}/${year}.`,
        metrics: [metric("Alunos ativos", "—"), metric("Aulas assistidas", "—")],
        columns: [
          { key: "matricula", label: "Matrícula", kind: "int" }, { key: "mes", label: "Mês" },
          { key: "aulas_assistidas", label: "Aulas assistidas", kind: "int" },
        ],
        rows: [],
        notice: "O serviço externo da Via Certa está indisponível no momento. Os demais módulos continuam atualizando normalmente.",
      };
    }
    return {
      title: "Alunos Via Certa",
      description: `Alunos ativos e consumo de aulas em ${month}/${year}.`,
      metrics: [
        metric("Alunos ativos", formatInt(response.total_alunos)),
        metric("Aulas assistidas", formatInt(response.total_aulas_assistidas)),
        metric("Média por aluno", response.total_alunos > 0 ? (response.total_aulas_assistidas / response.total_alunos).toFixed(1).replace(".", ",") : "0"),
      ],
      columns: [
        { key: "matricula", label: "Matrícula", kind: "int" }, { key: "mes", label: "Mês" },
        { key: "aulas_assistidas", label: "Aulas assistidas", kind: "int" },
      ],
      rows: response.alunos ?? [],
    };
  }

  if (modulo === "rh") {
    const response = await apiJson<Json>("/api/dashboard/rh");
    return {
      title: "Recursos Humanos",
      description: "Indicadores da equipe comercial sincronizados com vendedores e faturamento.",
      metrics: [
        metric("Vendedores", formatInt(response.total_vendedores)), metric("Ativos", formatInt(response.vendedores_ativos)),
        metric("Com vendas", formatInt(response.vendedores_com_venda)), metric("Faturamento", formatCompactCurrency(response.faturamento_ano)),
        metric("Média por ativo", formatCompactCurrency(response.media_por_vendedor_ativo)),
      ],
      columns: [
        { key: "APELIDO", label: "Colaborador" }, { key: "pedidos", label: "Pedidos", kind: "int" },
        { key: "ticket_medio", label: "Ticket médio", kind: "currency" }, { key: "faturamento", label: "Faturamento", kind: "currency" },
        { key: "ultima_venda", label: "Última venda", kind: "date" },
      ],
      rows: response.ranking ?? [],
      snapshotAt: response.snapshot_at,
      notice: "O snapshot atual possui dados da equipe comercial. Folha, ponto e cargos dependem de uma futura integração de RH.",
    };
  }

  const setup = await apiJson<Json>("/api/auth/setup");
  return {
    title: "Configuração e Segurança",
    description: "Cadastro do acesso protegido por Google Authenticator.",
    metrics: [metric("Autenticação", "TOTP"), metric("Emissor", setup.issuer), metric("Conta", setup.account)],
    columns: [], rows: [], setup: {
      account: String(setup.account),
      issuer: String(setup.issuer),
      manualKey: String(setup.manualKey),
      qrCodeUrl: String(setup.qrCodeUrl),
    },
    notice: "Não compartilhe a chave manual nem o QR Code. Qualquer pessoa com esses dados pode gerar códigos de acesso.",
  };
}

function ModulePage() {
  const { modulo } = Route.useParams();
  const { filters } = useFilters();
  const query = useQuery({
    queryKey: ["module-page", modulo, filters],
    queryFn: () => {
      if (!SUPPORTED.has(modulo)) throw new Error("Módulo não encontrado.");
      return moduleView(modulo, filters);
    },
    staleTime: 30_000,
  });

  if (query.isPending || query.error) {
    return <QueryState loading={query.isPending} error={query.error} retry={() => void query.refetch()} />;
  }

  const view = query.data;
  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{view.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{view.description}</p>
      </header>

      {view.notice && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{view.notice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {view.metrics.map((item) => <AnalyticsKpi key={item.label} {...item} />)}
      </div>

      {view.setup && (
        <section className="grid gap-5 rounded-2xl border border-border/40 bg-surface p-5 md:grid-cols-[260px_1fr]">
          <div className="rounded-xl bg-white p-3">
            <img src={view.setup.qrCodeUrl} alt="QR Code para Google Authenticator" className="mx-auto h-60 w-60" />
          </div>
          <div className="flex flex-col justify-center">
            <KeyRound className="h-7 w-7 text-primary" />
            <h3 className="mt-3 text-lg font-semibold">Google Authenticator</h3>
            <p className="mt-2 text-sm text-muted-foreground">Escaneie o QR Code ou cadastre a chave abaixo manualmente.</p>
            <code className="mt-4 break-all rounded-lg border border-border/50 bg-background p-3 text-sm text-foreground">{view.setup.manualKey}</code>
          </div>
        </section>
      )}

      {view.columns.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-border/40 bg-surface">
          <div className="border-b border-border/40 px-5 py-4">
            <h3 className="text-sm font-semibold">Detalhamento</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{view.rows.length} registros exibidos</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>{view.columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {view.rows.map((row, index) => (
                  <TableRow key={String(row.id ?? row.NUNOTA ?? row.CODPROD ?? row.CODVEND ?? row.CODEMP ?? row.matricula ?? index)}>
                    {view.columns.map((column) => (
                      <TableCell key={column.key} className={column.kind === "currency" || column.kind === "int" || column.kind === "percent" ? "text-right tabular-nums" : ""}>
                        {cell(row[column.key], column.kind)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {view.rows.length === 0 && <TableRow><TableCell colSpan={view.columns.length} className="h-28 text-center text-muted-foreground">Nenhum registro disponível para o período.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
