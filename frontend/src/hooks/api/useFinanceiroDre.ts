import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type {
  FinanceiroDreDto,
  FinanceiroDreFiltroDatas,
  FinanceiroDrePeriodo,
} from "@/lib/api/types.dashboard";
import { empresaKey, empresaQueryValue, type EmpresaSeleção } from "@/lib/empresaSelecao";

export type { FinanceiroDrePeriodo };

async function fetchDre(
  empresa: EmpresaSeleção,
  periodo: FinanceiroDrePeriodo,
  datas: FinanceiroDreFiltroDatas = {},
): Promise<FinanceiroDreDto> {
  return apiJson<FinanceiroDreDto>("/api/dashboard/financeiro/dre", {
    query: {
      empresa: empresaQueryValue(empresa),
      periodo,
      dataInicio: datas.dataInicio,
      dataFim: datas.dataFim,
    },
  });
}

export function useFinanceiroDre(
  empresa: EmpresaSeleção,
  periodo: FinanceiroDrePeriodo,
  datas: FinanceiroDreFiltroDatas = {},
) {
  return useQuery({
    queryKey: [
      "financeiroDre",
      { empresaKey: empresaKey(empresa), periodo, dataInicio: datas.dataInicio, dataFim: datas.dataFim },
    ] as const,
    queryFn: () => fetchDre(empresa, periodo, datas),
    staleTime: 30_000,
  });
}
