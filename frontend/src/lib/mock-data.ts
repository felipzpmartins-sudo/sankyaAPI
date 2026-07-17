// Dados mockados realistas para calibrar as 4 telas do dashboard Sankhya/MKR.
// Estrutura reflete o contrato dos endpoints reais descritos na especificação.

import { PROJETOS } from "./filters-context";

// Fixed timestamp para evitar hydration mismatch entre SSR e client.
// Substituir pelo campo `snapshot_at` retornado pelos endpoints reais.
export const SNAPSHOT_AT = "2026-07-08T11:30:00.000Z";

// -------- Tela 1 · Faturamento --------

export const faturamentoResumo = {
  faturamento_bruto: 4_812_540.75,
  qtd_notas: 186,
  ticket_medio: 25_874.95,
  variacao_pct: 12.4,
  snapshot_at: SNAPSHOT_AT,
};

export const faturamentoEvolucao = [
  { mes: "Jan", atual: 3_120_000, anterior: 2_890_000 },
  { mes: "Fev", atual: 3_450_000, anterior: 3_010_000 },
  { mes: "Mar", atual: 3_980_000, anterior: 3_450_000 },
  { mes: "Abr", atual: 4_120_000, anterior: 3_600_000 },
  { mes: "Mai", atual: 4_390_000, anterior: 3_820_000 },
  { mes: "Jun", atual: 4_640_000, anterior: 4_100_000 },
  { mes: "Jul", atual: 4_812_540, anterior: 4_280_000 },
];

export const faturamentoPorEmpresa = [
  { empresa: "MKR Matriz", valor: 2_130_450 },
  { empresa: "MKR Filial SP", valor: 1_412_890 },
  { empresa: "MKR Filial RJ", valor: 812_300 },
  { empresa: "MKR Logística", valor: 456_900 },
];

export const rankingVendedores = [
  { pos: 1, nome: "Ana Ribeiro", faturamento: 812_450, notas: 34, ticket: 23_895 },
  { pos: 2, nome: "Carlos Menezes", faturamento: 745_120, notas: 29, ticket: 25_694 },
  { pos: 3, nome: "Juliana Prado", faturamento: 689_540, notas: 27, ticket: 25_538 },
  { pos: 4, nome: "Rafael Souza", faturamento: 548_910, notas: 22, ticket: 24_950 },
  { pos: 5, nome: "Marina Alves", faturamento: 489_320, notas: 19, ticket: 25_754 },
  { pos: 6, nome: "Diego Farias", faturamento: 421_760, notas: 18, ticket: 23_431 },
  { pos: 7, nome: "Patrícia Lopes", faturamento: 389_540, notas: 15, ticket: 25_970 },
  { pos: 8, nome: "Bruno Aguiar", faturamento: 356_120, notas: 14, ticket: 25_437 },
];

export const lancamentosHoje = [
  { hora: "08:42", vendedor: "Ana Ribeiro", cliente: "Construtora Vega", valor: 48_920 },
  { hora: "09:15", vendedor: "Carlos Menezes", cliente: "Prime Distribuidora", valor: 22_450 },
  { hora: "10:03", vendedor: "Juliana Prado", cliente: "Metalúrgica Sul", valor: 91_780 },
  { hora: "11:27", vendedor: "Rafael Souza", cliente: "Indústria Norte", valor: 34_600 },
  { hora: "13:52", vendedor: "Marina Alves", cliente: "Grupo Alfa", valor: 18_940 },
  { hora: "14:36", vendedor: "Ana Ribeiro", cliente: "Cimentos MT", valor: 62_310 },
];

// -------- Tela 2 · DRE --------

export const dreProjetos = PROJETOS.map((p, idx) => {
  const receita = 380_000 + idx * 92_000 + (idx % 3) * 45_000;
  const custos = receita * (0.42 + (idx % 4) * 0.02);
  const admin = receita * (0.11 + (idx % 3) * 0.01);
  const comerciais = receita * (0.08 + (idx % 5) * 0.005);
  const impostos = receita * 0.14;
  const despesas_total = custos + admin + comerciais + impostos;
  const resultado = receita - despesas_total;
  return {
    codproj: p.codproj,
    nome: p.nome,
    receita_bruta: receita,
    custos,
    despesas_admin: admin,
    despesas_comerciais: comerciais,
    impostos,
    despesas_total,
    resultado_operacional: resultado,
    margem_pct: (resultado / receita) * 100,
  };
});

export const dreConsolidado = dreProjetos.reduce(
  (acc, p) => {
    acc.receita_bruta += p.receita_bruta;
    acc.custos += p.custos;
    acc.despesas_admin += p.despesas_admin;
    acc.despesas_comerciais += p.despesas_comerciais;
    acc.impostos += p.impostos;
    acc.despesas_total += p.despesas_total;
    acc.resultado_operacional += p.resultado_operacional;
    return acc;
  },
  {
    receita_bruta: 0,
    custos: 0,
    despesas_admin: 0,
    despesas_comerciais: 0,
    impostos: 0,
    despesas_total: 0,
    resultado_operacional: 0,
    margem_pct: 0,
  },
);
dreConsolidado.margem_pct =
  (dreConsolidado.resultado_operacional / dreConsolidado.receita_bruta) * 100;

export const fluxoCaixa = [
  { mes: "Jan", entradas: 3_120_000, saidas: 2_640_000 },
  { mes: "Fev", entradas: 3_450_000, saidas: 2_890_000 },
  { mes: "Mar", entradas: 3_980_000, saidas: 3_120_000 },
  { mes: "Abr", entradas: 4_120_000, saidas: 3_310_000 },
  { mes: "Mai", entradas: 4_390_000, saidas: 3_480_000 },
  { mes: "Jun", entradas: 4_640_000, saidas: 3_610_000 },
  { mes: "Jul", entradas: 4_812_540, saidas: 3_820_000 },
].map((row) => ({ ...row, saldo: row.entradas - row.saidas }));

export const contasReceber = Array.from({ length: 12 }).map((_, i) => ({
  parceiro: [
    "Construtora Vega",
    "Prime Distribuidora",
    "Metalúrgica Sul",
    "Indústria Norte",
    "Grupo Alfa",
    "Cimentos MT",
    "Tec Logística",
    "Aliança S/A",
    "BR Comércio",
    "Vale Metais",
    "Nova Química",
    "Sul Aços",
  ][i],
  vencimento: new Date(2026, 6, 3 + i * 2).toISOString(),
  valor_aberto: 12_000 + i * 4_320 + (i % 4) * 7_200,
  dias_atraso: [0, 0, 3, 8, 12, 22, 34, 47, 61, 0, 5, 18][i],
}));

export const contasPagar = Array.from({ length: 10 }).map((_, i) => ({
  parceiro: [
    "Fornecedor Delta",
    "Transportes RM",
    "Energia SP",
    "Locadora Centro",
    "Tec Serviços",
    "Insumos Beta",
    "Papelaria Central",
    "Logic Fretes",
    "Água & Cia",
    "Manutenção Prime",
  ][i],
  vencimento: new Date(2026, 6, 5 + i * 2).toISOString(),
  valor_aberto: 8_500 + i * 3_100,
  dias_atraso: [0, 0, 0, 4, 9, 15, 31, 42, 0, 7][i],
}));

// -------- Tela 3 · Qualidade do Dado --------

export const rateioResumo = {
  total_titulos: 842,
  com_rateio_ok: 612,
  sem_rateio: 178,
  rateio_incompleto: 52,
  valor_sem_rateio: 384_920.5,
  valor_rateio_incompleto: 112_540.8,
  snapshot_at: SNAPSHOT_AT,
};

export const semRateio = Array.from({ length: 14 }).map((_, i) => ({
  nufin: 90210 + i,
  parceiro: [
    "Fornecedor Delta",
    "Transportes RM",
    "Energia SP",
    "Locadora Centro",
    "Tec Serviços",
    "Insumos Beta",
    "Papelaria Central",
    "Logic Fretes",
    "Água & Cia",
    "Manutenção Prime",
    "BR Comércio",
    "Sul Aços",
    "Nova Química",
    "Aliança S/A",
  ][i],
  valor: 4_200 + i * 3_120 + (i % 3) * 5_100,
  data: new Date(2026, 5, 4 + i).toISOString(),
  projeto: "—",
  status: "SEM_RATEIO" as const,
}));

export const rateioIncompleto = Array.from({ length: 8 }).map((_, i) => ({
  nufin: 91100 + i,
  parceiro: [
    "Construtora Vega",
    "Prime Distribuidora",
    "Metalúrgica Sul",
    "Indústria Norte",
    "Grupo Alfa",
    "Cimentos MT",
    "Tec Logística",
    "Vale Metais",
  ][i],
  valor: 12_400 + i * 4_820,
  data: new Date(2026, 5, 10 + i).toISOString(),
  projeto: `Projeto ${["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"][i]}`,
  total_perc: [78, 92, 65, 88, 40, 95, 72, 60][i],
  status: "RATEIO_INCOMPLETO" as const,
}));

// -------- Tela 4 · Estoque --------

export const estoqueResumo = {
  skus_ativos: 1_284,
  abaixo_minimo: 47,
  valor_abaixo_minimo: 218_540.9,
  valor_total: 12_940_820,
  snapshot_at: SNAPSHOT_AT,
};

export const estoqueAlertas = Array.from({ length: 12 }).map((_, i) => {
  const min = 40 + (i % 5) * 10;
  const atual = Math.max(0, min - 5 - i);
  return {
    codigo: `SKU-${(1000 + i).toString()}`,
    descricao: [
      "Cabo elétrico 2,5mm 100m",
      "Parafuso sextavado M8x40",
      "Chapa aço 1,20mm 1x2m",
      "Tinta epóxi cinza 18L",
      "Perfil alumínio 3m",
      "Disjuntor tripolar 63A",
      "Rolamento 6205 blindado",
      "Solda MIG 1,0mm 15kg",
      "Válvula esfera 3/4\"",
      "Vedante teflon 12mm",
      "Broca aço rápido 8mm",
      "Óleo hidráulico ISO 68 20L",
    ][i],
    local: ["CD Matriz", "CD SP", "CD RJ"][i % 3],
    estoque: atual,
    minimo: min,
    diferenca: atual - min,
    valor_unit: 45 + i * 12,
  };
});
