import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { LancamentosHojeResponse } from "@/lib/api/types.dashboard";
import type { VendedorSeleção } from "@/lib/vendedorSelecao";
import { vendedorQueryValue } from "@/lib/vendedorSelecao";

async function fetchVendedoresLancamentosHoje(
  vendedor: VendedorSeleção,
  data?: string,
): Promise<LancamentosHojeResponse> {
  return apiJson<LancamentosHojeResponse>("/api/dashboard/vendedores/hoje", {
    query: {
      vendedor: vendedorQueryValue(vendedor),
      data,
    },
  });
}

export function useVendedoresLancamentosHoje(vendedor: VendedorSeleção = "todos", data?: string) {
  return useQuery({
    queryKey: ["vendedoresLancamentosHoje", { vendedor, data }],
    queryFn: () => fetchVendedoresLancamentosHoje(vendedor, data),
    staleTime: 30_000,
  });
}
