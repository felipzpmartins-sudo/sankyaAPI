import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, CalendarDays, Download, GraduationCap, LoaderCircle } from "lucide-react";

import { KpiCard } from "@/components/dashboard/KpiCard";
import { PanelCard } from "@/components/dashboard/PanelCard";
import { QueryState } from "@/components/dashboard/QueryState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiBlob, apiJson } from "@/lib/api";

type ViaCertaResponse = {
  filtro: { month: string; year: string };
  total_alunos: number;
  total_aulas_assistidas: number;
  alunos: Array<{ mes: string; matricula: number; aulas_assistidas: number }>;
};

export const Route = createFileRoute("/via-certa")({ component: ViaCertaPage });

function ViaCertaPage() {
  const today = new Date();
  const [month, setMonth] = useState(String(today.getMonth() + 1).padStart(2, "0"));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [exporting, setExporting] = useState(false);
  const years = useMemo(() => Array.from({ length: 5 }, (_, index) => String(today.getFullYear() - index)), [today]);
  const query = useQuery({
    queryKey: ["via-certa-alunos", month, year],
    queryFn: () => apiJson<ViaCertaResponse>("/api/viacerta/alunos-ativos", { month, year }),
  });
  const data = query.data;

  async function exportarExcel() {
    setExporting(true);
    try {
      const blob = await apiBlob("/api/viacerta/alunos-ativos/exportacao", { month, year });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `alunos-via-certa-${year}-${month}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Via Certa</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Acompanhamento de alunos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Alunos ativos e aulas assistidas no período selecionado.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-surface p-1.5 text-sm text-muted-foreground">
            <CalendarDays className="ml-1 h-4 w-4 text-primary" />
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-8 w-[120px] border-0 bg-transparent px-2 shadow-none"><SelectValue /></SelectTrigger>
              <SelectContent>{["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((value) => <SelectItem key={value} value={value}>{new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2026, Number(value) - 1, 1))}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="h-8 w-[82px] border-0 bg-transparent px-2 shadow-none"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="outline" className="h-10" onClick={() => void exportarExcel()} disabled={!data || exporting}>
            {exporting ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            Exportar Excel
          </Button>
        </div>
      </section>

      <QueryState loading={query.isLoading} error={query.error} retry={() => void query.refetch()} />

      {data && <>
        <section className="grid gap-4 sm:grid-cols-2">
          <KpiCard label="Alunos ativos" value={String(data.total_alunos)} hint="No período selecionado" tone="primary" icon={GraduationCap} />
          <KpiCard label="Aulas assistidas" value={data.total_aulas_assistidas.toLocaleString("pt-BR")} hint="Total registrado" tone="success" icon={Activity} />
        </section>

        <PanelCard title="Alunos ativos" description={`Referência: ${data.filtro.month}/${data.filtro.year}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-border/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-3 font-medium">Matrícula</th>
                  <th className="pb-3 font-medium">Mês</th>
                  <th className="pb-3 text-right font-medium">Aulas assistidas</th>
                </tr>
              </thead>
              <tbody>
                {data.alunos.map((aluno) => (
                  <tr key={`${aluno.mes}-${aluno.matricula}`} className="border-b border-border/30 last:border-0">
                    <td className="py-3 font-medium text-foreground">{aluno.matricula}</td>
                    <td className="py-3 text-muted-foreground">{aluno.mes}</td>
                    <td className="py-3 text-right font-semibold text-foreground">{aluno.aulas_assistidas.toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
                {data.alunos.length === 0 && (
                  <tr><td colSpan={3} className="py-10 text-center text-muted-foreground">Nenhum aluno ativo encontrado para este período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </PanelCard>
      </>}
    </div>
  );
}
