import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { FaturamentoPorEmpresaDto } from "@/lib/api/types.dashboard";
import { type VendedorSeleção, vendedorKey, vendedorQueryValue } from "@/lib/vendedorSelecao";

async function fetchPorEmpresa(vendedor: VendedorSeleção): Promise<FaturamentoPorEmpresaDto> {
  return apiJson<FaturamentoPorEmpresaDto>("/api/dashboard/empresa/faturamento-por-empresa", {
    query: {
      vendedor: vendedorQueryValue(vendedor),
    },
  });
}

export function useFaturamentoPorEmpresa(vendedor: VendedorSeleção = "todos") {
  return useQuery({
    queryKey: ["faturamentoPorEmpresa", { vendedorKey: vendedorKey(vendedor) }] as const,
    queryFn: () => fetchPorEmpresa(vendedor),
    staleTime: 30_000,
  });
}
