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

/**
 * Projetos que caem na faixa do grupo 04 mas nao sao empresa de destino.
 * Espelha EXCLUIDOS_EMPRESA_DESTINO em services/rateio-classification.ts —
 * as duas listas precisam concordar ou o filtro oferece um destino que a
 * classificacao rejeita.
 */
/**
 * Mantem dataInicio <= dataFim.
 *
 * Os dois campos de data escrevem separadamente no filtro, entao trocar
 * apenas um deles cria um instante com a faixa invertida. A consulta dispara
 * nesse estado, o backend recusa com 400 ("dataInicio deve ser menor ou igual
 * a dataFim") e a tela cai no boundary de erro.
 *
 * Quando a faixa fica invertida, a ponta que NAO foi editada acompanha a que
 * foi — comportamento usual de seletor de periodo, e nunca gera pedido
 * invalido.
 */
function normalizaPeriodo(
  anterior: GlobalFilters,
  patch: Partial<GlobalFilters>,
): Partial<GlobalFilters> {
  const dataInicio = patch.dataInicio ?? anterior.dataInicio;
  const dataFim = patch.dataFim ?? anterior.dataFim;
  if (!dataInicio || !dataFim || dataInicio <= dataFim) return patch;

  return patch.dataInicio !== undefined
    ? { ...patch, dataFim: dataInicio }
    : { ...patch, dataInicio: dataFim };
}

const PROJETOS_EXCLUIDOS = new Set<number>([40_701_000]);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setState] = useState<GlobalFilters>(defaultFilters);
  const options = useFilterOptions();
  const snapshotApplied = useRef(false);

  useEffect(() => {
    const snapshotDate = options.data?.snapshotDate;
    if (!snapshotDate || snapshotApplied.current) return;
    snapshotApplied.current = true;
    const grupo04 = (options.data?.projetos ?? [])
      .filter((projeto) => projeto.codproj >= 40_100_000 &&
          projeto.codproj <= 40_999_999 &&
          !PROJETOS_EXCLUIDOS.has(projeto.codproj))
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
    setFilters: (patch) =>
      setState((previous) => ({ ...previous, ...normalizaPeriodo(previous, patch) })),
    resetFilters: () => {
      const next = defaultFilters();
      const snapshotDate = options.data?.snapshotDate;
      const grupo04 = (options.data?.projetos ?? [])
        .filter((projeto) => projeto.codproj >= 40_100_000 &&
          projeto.codproj <= 40_999_999 &&
          !PROJETOS_EXCLUIDOS.has(projeto.codproj))
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
