import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { EmpresasResponse } from "@/lib/api/types.dashboard";

async function fetchEmpresas(): Promise<EmpresasResponse> {
  return apiJson<EmpresasResponse>("/api/empresas");
}

export function useEmpresas() {
  return useQuery({
    queryKey: ["empresas"] as const,
    queryFn: fetchEmpresas,
    staleTime: 60_000,
  });
}
