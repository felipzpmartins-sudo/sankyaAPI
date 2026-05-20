import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { EstoqueDto } from "@/lib/api/types.dashboard";
import { empresaKey, empresaQueryValue, type EmpresaSeleção } from "@/lib/empresaSelecao";

async function fetchEstoque(empresa: EmpresaSeleção): Promise<EstoqueDto> {
  return apiJson<EstoqueDto>("/api/dashboard/estoque", {
    query: {
      empresa: empresaQueryValue(empresa),
    },
  });
}

export function useEstoque(empresa: EmpresaSeleção = "todas") {
  return useQuery({
    queryKey: ["estoque", { empresa: empresaKey(empresa) }] as const,
    queryFn: () => fetchEstoque(empresa),
    staleTime: 30_000,
  });
}
