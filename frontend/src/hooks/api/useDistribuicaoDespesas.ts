import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { DistribuicaoDespesasDto, FinanceiroDrePeriodo } from "@/lib/api/types.dashboard";
import { empresaKey, empresaQueryValue, type EmpresaSeleção } from "@/lib/empresaSelecao";

async function fetchDistrib(
  empresa: EmpresaSeleção,
  periodo: FinanceiroDrePeriodo,
): Promise<DistribuicaoDespesasDto> {
  return apiJson<DistribuicaoDespesasDto>(
    "/api/dashboard/financeiro/distribuicao-despesas",
    {
      query: {
        empresa: empresaQueryValue(empresa),
        periodo,
      },
    },
  );
}

export function useDistribuicaoDespesas(
  empresa: EmpresaSeleção,
  periodo: FinanceiroDrePeriodo,
) {
  return useQuery({
    queryKey: ["distribuicaoDespesas", { empresaKey: empresaKey(empresa), periodo }] as const,
    queryFn: () => fetchDistrib(empresa, periodo),
    staleTime: 30_000,
  });
}
