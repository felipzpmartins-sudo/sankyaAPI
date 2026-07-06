import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { RateioResponse } from "@/lib/api/types.dashboard";
import { empresaKey, empresaQueryValue, type EmpresaSeleção } from "@/lib/empresaSelecao";

async function fetchRateio(empresa: EmpresaSeleção, dataInicio: string, dataFim: string): Promise<RateioResponse> {
  return apiJson<RateioResponse>("/api/dashboard/financeiro/rateio", {
    query: {
      codEmp: empresaQueryValue(empresa),
      dataInicio,
      dataFim,
    },
  });
}

export function useRateio(empresa: EmpresaSeleção, dataInicio: string, dataFim: string) {
  return useQuery({
    queryKey: ["rateio", { empresaKey: empresaKey(empresa), dataInicio, dataFim }],
    queryFn: () => fetchRateio(empresa, dataInicio, dataFim),
    staleTime: 30_000,
  });
}
