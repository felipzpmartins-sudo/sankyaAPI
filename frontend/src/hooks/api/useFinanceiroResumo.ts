import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type {
  FinanceiroDreFiltroDatas,
  FinanceiroDrePeriodo,
  FinanceiroResumoDto,
} from "@/lib/api/types.dashboard";
import { empresaKey, empresaQueryValue, type EmpresaSelecao } from "@/lib/empresaSelecao";

async function fetchFinanceiroResumo(
  empresa: EmpresaSelecao,
  periodo: FinanceiroDrePeriodo,
  datas: FinanceiroDreFiltroDatas = {},
  fluxoMeses: number,
): Promise<FinanceiroResumoDto> {
  return apiJson<FinanceiroResumoDto>("/api/dashboard/financeiro/resumo", {
    query: {
      empresa: empresaQueryValue(empresa),
      periodo,
      dataInicio: datas.dataInicio,
      dataFim: datas.dataFim,
      codTipOper: datas.codTipOper,
      fluxoMeses,
    },
  });
}

export function useFinanceiroResumo(
  empresa: EmpresaSelecao,
  periodo: FinanceiroDrePeriodo,
  datas: FinanceiroDreFiltroDatas = {},
  fluxoMeses = 12,
) {
  return useQuery({
    queryKey: [
      "financeiroResumo",
      {
        empresaKey: empresaKey(empresa),
        periodo,
        dataInicio: datas.dataInicio,
        dataFim: datas.dataFim,
        codTipOper: datas.codTipOper,
        fluxoMeses,
      },
    ] as const,
    queryFn: () => fetchFinanceiroResumo(empresa, periodo, datas, fluxoMeses),
    staleTime: 60_000,
  });
}
