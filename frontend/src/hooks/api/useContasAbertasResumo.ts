import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { ContasFinanceirasDto } from "@/lib/api/types.dashboard";
import { empresaKey, empresaQueryValue, type EmpresaSeleção } from "@/lib/empresaSelecao";

async function fetchContas(
  empresa: EmpresaSeleção,
  tipo: "receber" | "pagar",
): Promise<ContasFinanceirasDto> {
  return apiJson<ContasFinanceirasDto>("/api/dashboard/financeiro/contas", {
    query: {
      empresa: empresaQueryValue(empresa),
      tipo,
      page: 0,
      pageSize: 1,
    },
  });
}

export function useContasAbertasResumo(empresa: EmpresaSeleção, tipo: "receber" | "pagar") {
  return useQuery({
    queryKey: ["contasAbertasResumo", { empresaKey: empresaKey(empresa), tipo }] as const,
    queryFn: () => fetchContas(empresa, tipo),
    staleTime: 30_000,
  });
}
