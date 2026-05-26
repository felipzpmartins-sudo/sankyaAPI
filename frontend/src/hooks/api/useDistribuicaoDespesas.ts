import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type {
  DistribuicaoDespesasDto,
  FinanceiroDreFiltroDatas,
  FinanceiroDrePeriodo,
} from "@/lib/api/types.dashboard";
import { empresaKey, empresaQueryValue, type EmpresaSeleção } from "@/lib/empresaSelecao";

async function fetchDistrib(
  empresa: EmpresaSeleção,
  periodo: FinanceiroDrePeriodo,
  datas: FinanceiroDreFiltroDatas = {},
): Promise<DistribuicaoDespesasDto> {
  return apiJson<DistribuicaoDespesasDto>(
    "/api/dashboard/financeiro/distribuicao-despesas",
    {
      query: {
        empresa: empresaQueryValue(empresa),
        periodo,
        dataInicio: datas.dataInicio,
        dataFim: datas.dataFim,
      },
    },
  );
}

export function useDistribuicaoDespesas(
  empresa: EmpresaSeleção,
  periodo: FinanceiroDrePeriodo,
  datas: FinanceiroDreFiltroDatas = {},
) {
  return useQuery({
    queryKey: [
      "distribuicaoDespesas",
      { empresaKey: empresaKey(empresa), periodo, dataInicio: datas.dataInicio, dataFim: datas.dataFim },
    ] as const,
    queryFn: () => fetchDistrib(empresa, periodo, datas),
    staleTime: 30_000,
  });
}
