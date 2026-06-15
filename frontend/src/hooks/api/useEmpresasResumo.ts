import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { EmpresasResumoDto } from "@/lib/api/types.dashboard";
import { empresaKey, empresaQueryValue, type EmpresaSelecao } from "@/lib/empresaSelecao";
import { vendedorKey, vendedorQueryValue, type VendedorSelecao } from "@/lib/vendedorSelecao";
import type { VendedoresPeriodo } from "./useVendedoresRanking";

async function fetchEmpresasResumo(
  empresa: EmpresaSelecao,
  vendedor: VendedorSelecao,
  data?: string,
  periodo: VendedoresPeriodo = "ano",
): Promise<EmpresasResumoDto> {
  return apiJson<EmpresasResumoDto>("/api/dashboard/empresa/resumo", {
    query: {
      empresa: empresaQueryValue(empresa),
      vendedor: vendedorQueryValue(vendedor),
      data,
      periodo,
    },
  });
}

export function useEmpresasResumo(
  empresa: EmpresaSelecao,
  vendedor: VendedorSelecao = "todos",
  data?: string,
  periodo: VendedoresPeriodo = "ano",
) {
  return useQuery({
    queryKey: [
      "empresasResumo",
      {
        empresaKey: empresaKey(empresa),
        vendedorKey: vendedorKey(vendedor),
        data,
        periodo,
      },
    ] as const,
    queryFn: () => fetchEmpresasResumo(empresa, vendedor, data, periodo),
    staleTime: 60_000,
  });
}
