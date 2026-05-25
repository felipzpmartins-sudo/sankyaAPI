import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { ClientesBIResponse } from "@/lib/api/types.dashboard";

async function fetchClientesBI(): Promise<ClientesBIResponse> {
  return apiJson<ClientesBIResponse>("/api/dashboard/clientes");
}

export function useClientesBI() {
  return useQuery({
    queryKey: ["clientesBI"] as const,
    queryFn: fetchClientesBI,
    staleTime: 60_000,
  });
}
