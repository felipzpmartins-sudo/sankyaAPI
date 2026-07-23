import { apiBlob, empresaQuery } from "@/lib/api";
import type { GlobalFilters } from "@/lib/filters-context";

export type FinanceiroExportTipo =
  | "dre-comparativo"
  | "contas-receber"
  | "contas-pagar"
  | "movimentos";

const nomesArquivo: Record<FinanceiroExportTipo, string> = {
  "dre-comparativo": "dre-comparativo",
  "contas-receber": "contas-a-receber",
  "contas-pagar": "contas-a-pagar",
  movimentos: "movimentos-financeiros",
};

export async function exportarFinanceiro(
  tipo: FinanceiroExportTipo,
  filters: GlobalFilters,
): Promise<void> {
  const blob = await apiBlob("/api/dashboard/financeiro/exportacao", {
    tipo,
    empresa: empresaQuery(filters.empresas),
    dataInicio: filters.dataInicio,
    dataFim: filters.dataFim,
    codProj: filters.projetos.length > 0 ? filters.projetos.join(",") : undefined,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${nomesArquivo[tipo]}-${filters.dataInicio}-${filters.dataFim}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
