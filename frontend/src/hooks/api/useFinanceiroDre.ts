import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { FinanceiroDreDto, FinanceiroDrePeriodo } from "@/lib/api/types.dashboard";
import { empresaKey, empresaQueryValue, type EmpresaSeleção } from "@/lib/empresaSelecao";

export type { FinanceiroDrePeriodo };

async function fetchDre(
  empresa: EmpresaSeleção,
  periodo: FinanceiroDrePeriodo,
): Promise<FinanceiroDreDto> {
  return apiJson<FinanceiroDreDto>("/api/dashboard/financeiro/dre", {
    query: {
      empresa: empresaQueryValue(empresa),
      periodo,
    },
  });
}

export function useFinanceiroDre(empresa: EmpresaSeleção, periodo: FinanceiroDrePeriodo) {
  return useQuery({
    queryKey: ["financeiroDre", { empresaKey: empresaKey(empresa), periodo }] as const,
    queryFn: () => fetchDre(empresa, periodo),
    staleTime: 30_000,
  });
}
