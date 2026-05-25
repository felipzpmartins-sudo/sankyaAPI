export type EmpresaDashboardDto = {
  CODEMP: number;
  NOMEFANTASIA: string;
  ordem: number;
  ativa: 0 | 1;
};

export type EmpresasResponse = {
  empresas: EmpresaDashboardDto[];
};

export type VendedorDto = {
  CODVEND: number;
  APELIDO: string;
  ativo: 0 | 1;
};

export type VendedoresResponse = {
  vendedores: VendedorDto[];
};

export type VendedorRankingDto = VendedorDto & {
  faturamento: number;
  percentual: number;
};

export type VendedoresRankingResponse = {
  periodo: string;
  total: number;
  snapshot_at: string | null;
  ranking: VendedorRankingDto[];
};

export type LancamentoHojeDto = {
  NUNOTA: number;
  NUMNOTA: number | null;
  SERIENOTA: string | null;
  empresa: string;
  CODVEND: number | null;
  APELIDO: string | null;
  itens: string;
  valor: number;
};

export type LancamentosHojeResponse = {
  periodo: string;
  total: number;
  snapshot_at: string | null;
  lancamentos: LancamentoHojeDto[];
};

export type FaturamentoConsolidadoDto = {
  filtro: string;
  dia: number;
  semana_7d: number;
  mes_atual: number;
  ano_atual: number;
  snapshot_at: string | null;
};

export type FaturamentoEmpresaLinha = {
  CODEMP: number;
  NOMEFANTASIA: string;
  faturamento: number;
  percentual: number;
};

export type FaturamentoPorEmpresaDto = {
  periodo: string;
  total: number;
  snapshot_at: string | null;
  empresas: FaturamentoEmpresaLinha[];
};

/** `GET /api/dashboard/financeiro/dre` */
export type FinanceiroDreDto = {
  filtro: string;
  periodo: string;
  receita_bruta: number;
  custos: number;
  despesas_admin: number;
  despesas_comerciais: number;
  impostos: number;
  despesas_total: number;
  resultado_operacional: number;
  margem_pct: number;
  snapshot_at: string | null;
};

export type FinanceiroDrePeriodo = "mes" | "ano";

/** `GET /api/dashboard/financeiro/fluxo-caixa` */
export type FluxoCaixaDto = {
  filtro: string;
  meses: number;
  snapshot_at: string | null;
  serie: { mes: string; entradas: number; saidas: number; saldo: number }[];
};

/** `GET /api/dashboard/financeiro/distribuicao-despesas` */
export type DistribuicaoDespesasDto = {
  filtro: string;
  periodo: string;
  total: number;
  snapshot_at: string | null;
  categorias: { categoria: string; valor: number; percentual: number }[];
};

/** `GET /api/dashboard/financeiro/contas` (uso resumido para KPI) */
export type ContasFinanceirasDto = {
  filtro: string;
  tipo: string;
  page: number;
  pageSize: number;
  total: number;
  valor_total_aberto: number;
  snapshot_at: string | null;
  titulos: unknown[];
};

export type EstoqueKpiDto = {
  label: string;
  value: string;
  delta?: string;
  up: boolean;
  color: string;
  alert?: boolean;
};

export type EstoqueNivelDto = {
  cat: string;
  atual: number;
  min: number;
};

export type EstoqueAlertaDto = {
  item: string;
  empresa: string | null;
  local: string | null;
  parceiro: string | null;
  atual: number;
  min: number;
  status: "green" | "amber" | "red";
};

export type EstoqueLocalDto = {
  empresa: string;
  local: string;
  linhas: number;
  estoque: number;
};

export type EstoqueNegativoDto = {
  item: string;
  empresa: string;
  local: string;
  parceiro: string;
  estoque: number;
};

export type EstoqueDto = {
  filtro: string;
  snapshot_at: string | null;
  kpis: EstoqueKpiDto[];
  niveis: EstoqueNivelDto[];
  alertas: EstoqueAlertaDto[];
  locais: EstoqueLocalDto[];
  negativos: EstoqueNegativoDto[];
};

export type ProdutoDto = {
  CODPROD: number;
  DESCRPROD: string;
  REFERENCIA: string | null;
  MARCA: string | null;
  USOPROD: string | null;
  CODVOL: string | null;
  CODGRUPOPROD: number | null;
  GRUPO_DESCR: string | null;
  UNIDADE: string | null;
  ativo: 0 | 1;
  ESTOQUE: number;
  EST_MINIMO: number;
  EST_MAXIMO: number;
  synced_at: string;
};

export type ProdutosResponse = {
  produtos: ProdutoDto[];
};
