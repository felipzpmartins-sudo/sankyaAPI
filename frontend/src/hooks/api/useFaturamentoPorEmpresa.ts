import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { FaturamentoPorEmpresaDto } from "@/lib/api/types.dashboard";
import { type VendedorSeleção, vendedorKey, vendedorQueryValue } from "@/lib/vendedorSelecao";

async function fetchPorEmpresa(
  vendedor: VendedorSeleção,
  data?: string,
): Promise<FaturamentoPorEmpresaDto> {
  return apiJson<FaturamentoPorEmpresaDto>("/api/dashboard/empresa/faturamento-por-empresa", {
    query: {
      vendedor: vendedorQueryValue(vendedor),
      data,
    },
  });
}

export function useFaturamentoPorEmpresa(vendedor: VendedorSeleção = "todos", data?: string) {
  return useQuery({
    queryKey: ["faturamentoPorEmpresa", { vendedorKey: vendedorKey(vendedor), data }] as const,
    queryFn: () => fetchPorEmpresa(vendedor, data),
    staleTime: 30_000,
  });
}
