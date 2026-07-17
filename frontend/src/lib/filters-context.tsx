import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useFilterOptions } from "@/hooks/use-dashboard-data";

export type Empresa = { codemp: number; nome: string };
export type Projeto = { codproj: number; nome: string };
export type Vendedor = { codvend: number; nome: string };

// Mantidos apenas para compatibilidade com o arquivo de mocks, que não é usado em runtime.
export const EMPRESAS: Empresa[] = [];
export const PROJETOS: Projeto[] = [];

export type GlobalFilters = {
  empresas: number[];
  projetos: number[];
  vendedores: number[];
  dataInicio: string;
  dataFim: string;
};

type FiltersCtx = {
  filters: GlobalFilters;
  empresas: Empresa[];
  projetos: Projeto[];
  vendedores: Vendedor[];
  setFilters: (patch: Partial<GlobalFilters>) => void;
  resetFilters: () => void;
};

function iso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function yearStart(date: string) {
  return `${date.slice(0, 4)}-01-01`;
}

function defaultFilters(): GlobalFilters {
  const now = new Date();
  const first = new Date(now.getFullYear(), 0, 1);
  return {
    empresas: [],
    projetos: [],
    vendedores: [],
    dataInicio: iso(first),
    dataFim: iso(now),
  };
}

const Ctx = createContext<FiltersCtx | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setState] = useState<GlobalFilters>(defaultFilters);
  const options = useFilterOptions();
  const snapshotApplied = useRef(false);

  useEffect(() => {
    const snapshotDate = options.data?.snapshotDate;
    if (!snapshotDate || snapshotApplied.current) return;
    snapshotApplied.current = true;
    const grupo04 = (options.data?.projetos ?? [])
      .filter((projeto) => projeto.codproj >= 40_100_000 && projeto.codproj <= 40_999_999)
      .map((projeto) => projeto.codproj);
    setState((previous) => ({
      ...previous,
      projetos: grupo04.length > 0 ? grupo04 : previous.projetos,
      dataInicio: yearStart(snapshotDate),
      dataFim: snapshotDate,
    }));
  }, [options.data?.projetos, options.data?.snapshotDate]);

  const value = useMemo<FiltersCtx>(() => ({
    filters,
    empresas: options.data?.empresas ?? [],
    projetos: options.data?.projetos ?? [],
    vendedores: options.data?.vendedores ?? [],
    setFilters: (patch) => setState((previous) => ({ ...previous, ...patch })),
    resetFilters: () => {
      const next = defaultFilters();
      const snapshotDate = options.data?.snapshotDate;
      const grupo04 = (options.data?.projetos ?? [])
        .filter((projeto) => projeto.codproj >= 40_100_000 && projeto.codproj <= 40_999_999)
        .map((projeto) => projeto.codproj);
      setState({
        ...next,
        projetos: grupo04,
        ...(snapshotDate ? { dataInicio: yearStart(snapshotDate), dataFim: snapshotDate } : {}),
      });
    },
  }), [filters, options.data]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFilters() {
  const context = useContext(Ctx);
  if (!context) throw new Error("useFilters must be used inside <FiltersProvider>");
  return context;
}
