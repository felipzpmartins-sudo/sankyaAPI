import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { FluxoCaixaDto } from "@/lib/api/types.dashboard";
import { empresaKey, empresaQueryValue, type EmpresaSeleção } from "@/lib/empresaSelecao";

async function fetchFluxo(
  empresa: EmpresaSeleção,
  meses: number,
): Promise<FluxoCaixaDto> {
  return apiJson<FluxoCaixaDto>("/api/dashboard/financeiro/fluxo-caixa", {
    query: {
      empresa: empresaQueryValue(empresa),
      meses,
    },
  });
}

export function useFluxoCaixa(empresa: EmpresaSeleção, meses: number) {
  return useQuery({
    queryKey: ["fluxoCaixa", { empresaKey: empresaKey(empresa), meses }] as const,
    queryFn: () => fetchFluxo(empresa, meses),
    staleTime: 30_000,
  });
}
