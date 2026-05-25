import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { ProdutosResponse } from "@/lib/api/types.dashboard";

async function fetchProdutos(): Promise<ProdutosResponse> {
  return apiJson<ProdutosResponse>("/api/dashboard/produtos");
}

export function useProdutos() {
  return useQuery({
    queryKey: ["produtos"] as const,
    queryFn: fetchProdutos,
    staleTime: 60_000,
  });
}
