import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api/client";
import type { ViaCertaAlunosAtivosResponse } from "@/lib/api/types.dashboard";

async function fetchViaCertaAlunosAtivos(
  month: string,
  year: string,
): Promise<ViaCertaAlunosAtivosResponse> {
  return apiJson<ViaCertaAlunosAtivosResponse>("/api/viacerta/alunos-ativos", {
    query: { month, year },
  });
}

export function useViaCertaAlunosAtivos(month: string, year: string) {
  return useQuery({
    queryKey: ["viaCertaAlunosAtivos", { month, year }] as const,
    queryFn: () => fetchViaCertaAlunosAtivos(month, year),
    staleTime: 60_000,
  });
}
