import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { VendedoresRankingResponse } from "@/lib/api/types.dashboard";

export type VendedoresPeriodo = "dia" | "mes" | "ano";

async function fetchVendedoresRanking(
  data?: string,
  periodo: VendedoresPeriodo = "ano",
): Promise<VendedoresRankingResponse> {
  return apiJson<VendedoresRankingResponse>("/api/dashboard/vendedores/ranking", {
    query: { data, periodo },
  });
}

export function useVendedoresRanking(data?: string, periodo: VendedoresPeriodo = "ano") {
  return useQuery({
    queryKey: ["vendedoresRanking", { data, periodo }] as const,
    queryFn: () => fetchVendedoresRanking(data, periodo),
    staleTime: 30_000,
  });
}
