import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { VendedoresRankingResponse } from "@/lib/api/types.dashboard";

async function fetchVendedoresRanking(): Promise<VendedoresRankingResponse> {
  return apiJson<VendedoresRankingResponse>("/api/dashboard/vendedores/ranking");
}

export function useVendedoresRanking() {
  return useQuery({
    queryKey: ["vendedoresRanking"] as const,
    queryFn: fetchVendedoresRanking,
    staleTime: 30_000,
  });
}
