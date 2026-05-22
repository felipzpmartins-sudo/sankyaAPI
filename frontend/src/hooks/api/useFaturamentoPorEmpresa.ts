import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { FaturamentoPorEmpresaDto } from "@/lib/api/types.dashboard";
import { type VendedorSeleção, vendedorKey, vendedorQueryValue } from "@/lib/vendedorSelecao";
import type { VendedoresPeriodo } from "./useVendedoresRanking";

async function fetchPorEmpresa(
  vendedor: VendedorSeleção,
  data?: string,
  periodo: VendedoresPeriodo = "ano",
): Promise<FaturamentoPorEmpresaDto> {
  return apiJson<FaturamentoPorEmpresaDto>("/api/dashboard/empresa/faturamento-por-empresa", {
    query: {
      vendedor: vendedorQueryValue(vendedor),
      data,
      periodo,
    },
  });
}

export function useFaturamentoPorEmpresa(
  vendedor: VendedorSeleção = "todos",
  data?: string,
  periodo: VendedoresPeriodo = "ano",
) {
  return useQuery({
    queryKey: ["faturamentoPorEmpresa", { vendedorKey: vendedorKey(vendedor), data, periodo }] as const,
    queryFn: () => fetchPorEmpresa(vendedor, data, periodo),
    staleTime: 30_000,
  });
}
