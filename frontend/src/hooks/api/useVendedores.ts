import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { VendedoresResponse } from "@/lib/api/types.dashboard";

async function fetchVendedores(): Promise<VendedoresResponse> {
  return apiJson<VendedoresResponse>("/api/vendedores");
}

export function useVendedores() {
  return useQuery({
    queryKey: ["vendedores"] as const,
    queryFn: fetchVendedores,
    staleTime: 60_000,
  });
}
