import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { EntregasBIResponse } from "@/lib/api/types.dashboard";

async function fetchEntregasBI(): Promise<EntregasBIResponse> {
  return apiJson<EntregasBIResponse>("/api/dashboard/entregas");
}

export function useEntregasBI() {
  return useQuery({
    queryKey: ["entregasBI"] as const,
    queryFn: fetchEntregasBI,
    staleTime: 60_000,
  });
}
