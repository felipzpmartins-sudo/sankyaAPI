import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { LancamentosHojeResponse } from "@/lib/api/types.dashboard";
import type { VendedorSeleção } from "@/lib/vendedorSelecao";
import { vendedorQueryValue } from "@/lib/vendedorSelecao";

async function fetchVendedoresLancamentosHoje(
  vendedor: VendedorSeleção,
): Promise<LancamentosHojeResponse> {
  return apiJson<LancamentosHojeResponse>("/api/dashboard/vendedores/hoje", {
    query: {
      vendedor: vendedorQueryValue(vendedor),
    },
  });
}

export function useVendedoresLancamentosHoje(vendedor: VendedorSeleção = "todos") {
  return useQuery({
    queryKey: ["vendedoresLancamentosHoje", vendedor],
    queryFn: () => fetchVendedoresLancamentosHoje(vendedor),
    staleTime: 30_000,
  });
}
