import { useQuery } from "@tanstack/react-query";

import { apiJson, empresaQuery } from "@/lib/api";
import type { GlobalFilters } from "@/lib/filters-context";

type FaturamentoResponse = {
  filtro: string;
  dia: number;
  semana_7d: number;
  mes_atual: number;
  ano_atual: number;
  faturamento_bruto: number;
  qtd_notas: number;
  ticket_medio: number;
  variacao_pct: number;
  evolucao: Array<{ mes: string; atual: number; anterior: number }>;
  snapshot_at: string | null;
};

type ResumoEmpresasResponse = {
  faturamento: FaturamentoResponse;
  faturamento_por_empresa: {
    empresas: Array<{ CODEMP: number; NOMEFANTASIA: string; faturamento: number }>;
  };
};

type LancamentosResponse = {
  lancamentos: Array<{
    NUNOTA: number;
    APELIDO: string | null;
    empresa: string;
    itens: string;
    valor: number;
  }>;
};

type RankingVendedoresResponse = {
  ranking: Array<{
    CODVEND: number;
    APELIDO: string;
    faturamento: number;
    qtd_notas: number;
    ticket_medio: number;
    percentual: number;
  }>;
};

type DreLinha = {
  codproj: number;
  nome: string;
  receita_bruta: number;
  custos: number;
  despesas_admin: number;
  despesas_comerciais: number;
  impostos: number;
  despesas_total: number;
  resultado_operacional: number;
  margem_pct: number;
};

type DreResponse = {
  projetos: DreLinha[];
  consolidado?: Omit<DreLinha, "codproj" | "nome">;
  snapshot_at: string | null;
};

type FluxoResponse = {
  serie: Array<{ mes: string; entradas: number; saidas: number; saldo: number }>;
};

type ContasResponse = {
  page: number;
  pageSize: number;
  total: number;
  valor_total_aberto: number;
  titulos: Array<{
    NOMEPARC: string | null;
    DTVENC: string | null;
    valor_aberto: number;
    dias_atraso: number;
  }>;
};

export type RateioItem = {
  nufin: number;
  nunota: number | null;
  codemp: number;
  empresa: string | null;
  codcencus: number | null;
  centro_resultado: string | null;
  codnat: number | null;
  natureza: string | null;
  parceiro: string | null;
  valor: number;
  valor_baixado: number;
  valor_juros: number;
  valor_multa: number;
  valor_desconto: number;
  historico: string | null;
  rateado_sankhya: string | null;
  numnota: number | null;
  serienota: string | null;
  valor_aberto: number;
  data: string | null;
  vencimento: string | null;
  baixa: string | null;
  em_aberto: boolean;
  tipo: string;
  codproj: number | null;
  titulo_codproj: number | null;
  titulo_projeto: string | null;
  projeto: string | null;
  total_perc?: number;
  percentual_valido?: number;
  valor_sem_projeto?: number;
  alerta?: string;
  distribuicao?: Array<{
    codproj: number | null;
    projeto?: string | null;
    percentual: number;
    valor: number;
    valor_baixado: number;
    valor_aberto: number;
    empresa_destino: boolean;
  }>;
  status: "COM_RATEIO" | "NAO_RATEIO" | "SEM_RATEIO" | "RATEIO_INCOMPLETO";
};

export type RateioProjetoResumo = {
  codproj: number;
  projeto: string;
  despesas: number;
  linhas: number;
  valor_rateado: number;
  percentual: number;
};

export type RateioResponse = {
  status: "OK" | "RATEIO_NAO_SINCRONIZADO";
  mensagem?: string;
  resumo: {
    total_titulos: number;
    com_rateio_ok: number;
    nao_rateio: number;
    sem_rateio: number;
    rateio_incompleto: number;
    titulos_validos: number;
    percentual_ok: number;
    pendencias: number;
    valor_com_rateio: number;
    valor_nao_rateio: number;
    valor_pendencias: number;
    valor_sem_rateio: number;
    valor_rateio_incompleto: number;
    titulos_sem_projeto: number;
    valor_sem_projeto: number;
    valor_rateado_total: number;
  };
  com_rateio: RateioItem[];
  com_rateio_page: {
    page: number;
    pageSize: number;
    total: number;
  };
  nao_rateio: RateioItem[];
  nao_rateio_page: {
    page: number;
    pageSize: number;
    total: number;
  };
  sem_rateio: RateioItem[];
  rateio_incompleto: RateioItem[];
  rateio_por_projeto: RateioProjetoResumo[];
  snapshot_at: string | null;
};

function commonQuery(filters: GlobalFilters) {
  return {
    empresa: empresaQuery(filters.empresas),
    vendedor: filters.vendedores.length > 0 ? filters.vendedores.join(",") : "todos",
    dataInicio: filters.dataInicio,
    dataFim: filters.dataFim,
    codProj: filters.projetos.length > 0 ? filters.projetos.join(",") : undefined,
  };
}

export function useFaturamentoDashboard(filters: GlobalFilters) {
  return useQuery({
    queryKey: ["faturamento-dashboard", filters],
    queryFn: async () => {
      const query = commonQuery(filters);
      const [resumo, lancamentos, ranking] = await Promise.all([
        apiJson<ResumoEmpresasResponse>("/api/dashboard/empresa/resumo", {
          ...query,
          data: filters.dataFim,
          periodo: "mes",
        }),
        apiJson<LancamentosResponse>("/api/dashboard/vendedores/hoje", {
          ...query,
          data: filters.dataFim,
        }),
        apiJson<RankingVendedoresResponse>("/api/dashboard/vendedores/ranking", {
          ...query,
          data: filters.dataFim,
          periodo: "mes",
        }),
      ]);
      const faturamento = resumo.faturamento;
      return {
        faturamentoResumo: {
          faturamento_bruto: faturamento.faturamento_bruto,
          qtd_notas: faturamento.qtd_notas,
          ticket_medio: faturamento.ticket_medio,
          variacao_pct: faturamento.variacao_pct,
          snapshot_at: faturamento.snapshot_at,
        },
        faturamentoEvolucao: faturamento.evolucao,
        faturamentoPorEmpresa: resumo.faturamento_por_empresa.empresas.map((empresa) => ({
          empresa: empresa.NOMEFANTASIA,
          valor: empresa.faturamento,
        })),
        lancamentosHoje: lancamentos.lancamentos.map((item) => ({
          id: item.NUNOTA,
          hora: "--:--",
          vendedor: item.APELIDO ?? "Sem vendedor",
          cliente: item.itens || item.empresa,
          valor: item.valor,
        })),
        rankingVendedores: ranking.ranking,
      };
    },
    staleTime: 30_000,
  });
}

function consolidar(projetos: DreLinha[]) {
  const total = projetos.reduce(
    (acc, item) => ({
      receita_bruta: acc.receita_bruta + item.receita_bruta,
      custos: acc.custos + item.custos,
      despesas_admin: acc.despesas_admin + item.despesas_admin,
      despesas_comerciais: acc.despesas_comerciais + item.despesas_comerciais,
      impostos: acc.impostos + item.impostos,
      despesas_total: acc.despesas_total + item.despesas_total,
      resultado_operacional: acc.resultado_operacional + item.resultado_operacional,
      margem_pct: 0,
    }),
    {
      receita_bruta: 0,
      custos: 0,
      despesas_admin: 0,
      despesas_comerciais: 0,
      impostos: 0,
      despesas_total: 0,
      resultado_operacional: 0,
      margem_pct: 0,
    },
  );
  total.margem_pct =
    total.receita_bruta > 0 ? (total.resultado_operacional / total.receita_bruta) * 100 : 0;
  return total;
}

export function useDreDashboard(
  filters: GlobalFilters,
  receberPage = 0,
  pagarPage = 0,
  pageSize = 20,
) {
  return useQuery({
    queryKey: ["dre-dashboard", filters, receberPage, pagarPage, pageSize],
    queryFn: async () => {
      const query = commonQuery(filters);
      const [dre, fluxo, receber, pagar] = await Promise.all([
        apiJson<DreResponse>("/api/dashboard/financeiro/dre-por-projeto", {
          ...query,
          periodo: "ano",
        }),
        apiJson<FluxoResponse>("/api/dashboard/financeiro/fluxo-caixa", { ...query, meses: 12 }),
        apiJson<ContasResponse>("/api/dashboard/financeiro/contas", {
          ...query,
          tipo: "receber",
          page: receberPage,
          pageSize,
        }),
        apiJson<ContasResponse>("/api/dashboard/financeiro/contas", {
          ...query,
          tipo: "pagar",
          page: pagarPage,
          pageSize,
        }),
      ]);
      const mapConta = (conta: ContasResponse["titulos"][number]) => ({
        parceiro: conta.NOMEPARC ?? "Sem parceiro",
        vencimento: conta.DTVENC ?? "",
        valor_aberto: conta.valor_aberto,
        dias_atraso: conta.dias_atraso,
      });
      return {
        dreProjetos: dre.projetos,
        dreConsolidado: dre.consolidado ?? consolidar(dre.projetos),
        fluxoCaixa: fluxo.serie,
        contasReceber: receber.titulos.map(mapConta),
        contasPagar: pagar.titulos.map(mapConta),
        contasReceberMeta: {
          page: receber.page,
          pageSize: receber.pageSize,
          total: receber.total,
          valorTotal: receber.valor_total_aberto,
        },
        contasPagarMeta: {
          page: pagar.page,
          pageSize: pagar.pageSize,
          total: pagar.total,
          valorTotal: pagar.valor_total_aberto,
        },
        snapshot_at: dre.snapshot_at,
      };
    },
    staleTime: 30_000,
  });
}

export function useRateioDashboard(filters: GlobalFilters, page = 0, naoPage = 0, pageSize = 20) {
  return useQuery({
    queryKey: ["rateio-dashboard", filters, page, naoPage, pageSize],
    queryFn: () =>
      apiJson<RateioResponse>("/api/dashboard/financeiro/rateio-diagnostico", {
        dataInicio: filters.dataInicio,
        dataFim: filters.dataFim,
        codEmp: filters.empresas.length > 0 ? filters.empresas.join(",") : undefined,
        codProj: filters.projetos.length > 0 ? filters.projetos.join(",") : undefined,
        page,
        pageSize,
        naoPage,
        naoPageSize: pageSize,
      }),
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });
}

export function useFilterOptions() {
  return useQuery({
    queryKey: ["filter-options"],
    queryFn: async () => {
      const [empresas, projetos, vendedores, health] = await Promise.all([
        apiJson<{ empresas: Array<{ CODEMP: number; NOMEFANTASIA: string }> }>("/api/empresas"),
        apiJson<{
          projetos: Array<{
            CODPROJ: number;
            DESCRPROJ: string | null;
            IDENTIFICACAO: string | null;
          }>;
        }>("/api/dashboard/projetos"),
        apiJson<{ vendedores: Array<{ CODVEND: number; APELIDO: string }> }>("/api/vendedores"),
        apiJson<{
          sync: { pedidos?: { last_synced_at?: string } | null };
          data_available?: { pedidos_ate?: string | null };
        }>("/api/health"),
      ]);
      return {
        empresas: empresas.empresas.map((empresa) => ({
          codemp: empresa.CODEMP,
          nome: empresa.NOMEFANTASIA,
        })),
        projetos: projetos.projetos.map((projeto) => ({
          codproj: projeto.CODPROJ,
          nome: projeto.DESCRPROJ ?? projeto.IDENTIFICACAO ?? `Projeto ${projeto.CODPROJ}`,
        })),
        vendedores: vendedores.vendedores.map((vendedor) => ({
          codvend: vendedor.CODVEND,
          nome: vendedor.APELIDO,
        })),
        snapshotDate:
          health.data_available?.pedidos_ate?.slice(0, 10) ??
          health.sync.pedidos?.last_synced_at?.slice(0, 10) ??
          null,
        snapshotAt: health.sync.pedidos?.last_synced_at ?? null,
      };
    },
    staleTime: 60_000,
  });
}
