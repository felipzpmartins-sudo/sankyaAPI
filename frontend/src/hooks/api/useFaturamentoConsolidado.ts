import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { FaturamentoConsolidadoDto } from "@/lib/api/types.dashboard";
import { empresaKey, type EmpresaSeleção, empresaQueryValue } from "@/lib/empresaSelecao";
import { type VendedorSeleção, vendedorKey, vendedorQueryValue } from "@/lib/vendedorSelecao";

export type { EmpresaSeleção };
export { empresaKey };

type Args = {
  empresa: EmpresaSeleção;
  vendedor?: VendedorSeleção;
  data?: string;
};

async function fetchFaturamento({
  empresa,
  vendedor = "todos",
  data,
}: Args): Promise<FaturamentoConsolidadoDto> {
  return apiJson<FaturamentoConsolidadoDto>("/api/dashboard/empresa/faturamento", {
    query: {
      empresa: empresaQueryValue(empresa),
      vendedor: vendedorQueryValue(vendedor),
      data,
    },
  });
}

export function useFaturamentoConsolidado(
  empresa: EmpresaSeleção,
  vendedor: VendedorSeleção = "todos",
  data?: string,
) {
  return useQuery({
    queryKey: [
      "faturamentoConsolidado",
      { empresaKey: empresaKey(empresa), vendedorKey: vendedorKey(vendedor), data },
    ] as const,
    queryFn: () => fetchFaturamento({ empresa, vendedor, data }),
    staleTime: 30_000,
  });
}
