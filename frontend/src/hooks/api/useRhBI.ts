import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { RhBIResponse } from "@/lib/api/types.dashboard";

async function fetchRhBI(): Promise<RhBIResponse> {
  return apiJson<RhBIResponse>("/api/dashboard/rh");
}

export function useRhBI() {
  return useQuery({
    queryKey: ["rhBI"] as const,
    queryFn: fetchRhBI,
    staleTime: 60_000,
  });
}
