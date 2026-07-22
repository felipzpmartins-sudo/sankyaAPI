import { useQuery } from "@tanstack/react-query";

import { apiJson, empresaQuery } from "@/lib/api";
import type { GlobalFilters } from "@/lib/filters-context";

export type ContaAberta = {
  NUFIN: number;
  NOMEPARC: string | null;
  DTVENC: string | null;
  valor_aberto: number;
  dias_atraso: number;
  DESCRNAT: string | null;
  CODPROJ: number | null;
};

export type ExecutivoDashboard = {
  periodo: { dataInicio: string; dataFim: string };
  snapshot_at: string | null;
  comercial: {
    fechado: { qtd: number; valor: number };
    cancelados: { qtd: number; valor: number };
    nota_venda: { qtd: number; valor: number };
    conversao_pct: number;
    por_projeto: Array<{
      codproj: number;
      nome: string;
      fechado: number;
      cancelados: number;
      nota_venda: number;
    }>;
    recentes: Array<{
      nunota: number;
      empresa: string;
      vendedor: string;
      projeto: string;
      status: string;
      data: string | null;
      valor: number;
    }>;
  };
  financeiro: {
    recebimentos: { qtd: number; valor: number };
    pagamentos: { qtd: number; valor: number };
    juros_antecipacoes: { qtd: number; valor: number };
    conta_receber_aberto: { qtd: number; valor: number };
    conta_pagar_aberto: { qtd: number; valor: number };
    vencidas: { qtd: number; valor: number };
    a_vencer: { qtd: number; valor: number };
    pagos_periodo_meses_anteriores: { qtd: number; valor: number };
    fluxo_caixa: Array<{ mes: string; entradas: number; saidas: number; saldo: number }>;
    contas_receber: {
      total: number;
      valor_total_aberto: number;
      titulos: ContaAberta[];
    };
    contas_pagar: {
      total: number;
      valor_total_aberto: number;
      titulos: ContaAberta[];
    };
    movimentos: Array<{
      nufin: number;
      data_baixa: string | null;
      tipo: "receber" | "pagar";
      parceiro: string;
      natureza: string;
      projeto: string;
      centro: string;
      valor: number;
    }>;
  };
  referencias: {
    projetos: Array<{
      CODPROJ: number;
      IDENTIFICACAO: string | null;
      DESCRPROJ: string | null;
      ativo: number;
    }>;
    centros_resultado: Array<{ CODCENCUS: number; DESCRCENCUS: string; ativo: number }>;
  };
};

export function useExecutivoDashboard(filters: GlobalFilters) {
  return useQuery({
    queryKey: ["executivo-dashboard", filters],
    queryFn: () =>
      apiJson<ExecutivoDashboard>("/api/dashboard/executivo", {
        empresa: empresaQuery(filters.empresas),
        vendedor: filters.vendedores.length > 0 ? filters.vendedores.join(",") : "todos",
        dataInicio: filters.dataInicio,
        dataFim: filters.dataFim,
        codProj: filters.projetos.length > 0 ? filters.projetos.join(",") : undefined,
      }),
    staleTime: 30_000,
  });
}
