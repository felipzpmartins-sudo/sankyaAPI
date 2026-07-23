import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";

import {
  gerarFinanceiroXlsxDoPayload,
  type FinanceiroExportArgs,
  type FinanceiroExportPayload,
} from "../src/services/financeiro-export.js";

const argsBase: Omit<FinanceiroExportArgs, "tipo"> = {
  filtro: { modo: "todas" },
  dataInicio: "2026-01-01",
  dataFim: "2026-07-23",
  codProj: [40_100_000, 40_200_000],
};

function arquivosExcel(buffer: Buffer) {
  assert.equal(buffer.subarray(0, 4).toString("hex"), "504b0304");
  return unzipSync(new Uint8Array(buffer));
}

function xmlCompleto(files: ReturnType<typeof arquivosExcel>): string {
  return Object.entries(files)
    .filter(([name]) => name.endsWith(".xml"))
    .map(([, bytes]) => new TextDecoder().decode(bytes))
    .join("\n");
}

test("gera DRE comparativo com filtros, projetos e consolidado", async () => {
  const payload: FinanceiroExportPayload = {
    tipo: "dre-comparativo",
    dre: {
      filtro: "Todas",
      periodo: "2026-01-01 a 2026-07-23",
      grupo: "ano",
      snapshot_at: "2026-07-23T12:00:00.000Z",
      projetos: [
        {
          filtro: "Todas",
          periodo: "2026-01-01 a 2026-07-23",
          snapshot_at: "2026-07-23T12:00:00.000Z",
          codproj: 40_100_000,
          nome: "Projeto Empresa A",
          CODPROJ: 40_100_000,
          CODPROJPAI: null,
          IDENTIFICACAO: "Empresa A",
          DESCRPROJ: "Empresa A",
          receita_bruta: 1_000,
          custos: 200,
          despesas_admin: 100,
          despesas_comerciais: 50,
          impostos: 80,
          despesas_total: 430,
          resultado_operacional: 570,
          margem_pct: 57,
        },
      ],
      consolidado: {
        receita_bruta: 1_000,
        custos: 200,
        despesas_admin: 100,
        despesas_comerciais: 50,
        impostos: 80,
        despesas_total: 430,
        resultado_operacional: 570,
        margem_pct: 57,
      },
    },
  };

  const files = arquivosExcel(await gerarFinanceiroXlsxDoPayload(payload, {
    ...argsBase,
    tipo: payload.tipo,
  }));
  const workbook = new TextDecoder().decode(files["xl/workbook.xml"]);
  const xml = xmlCompleto(files);

  assert.match(workbook, /name="Filtros"/);
  assert.match(workbook, /name="DRE por projeto"/);
  for (const texto of ["Empresa A", "Receita bruta", "Resultado operacional", "Consolidado"]) {
    assert.ok(xml.includes(texto), `conteudo ausente no Excel: ${texto}`);
  }
  assert.ok(!xml.includes("2026-01-01"), "datas dos filtros devem ser celulas do Excel");
});

test("gera contas a receber com todos os campos operacionais", async () => {
  const payload: FinanceiroExportPayload = {
    tipo: "contas-receber",
    contas: [
      {
        NUFIN: 123,
        CODEMP: 1,
        CODPARC: 99,
        NOMEPARC: "Cliente de teste",
        CODCENCUS: 10,
        CODPROJ: 40_100_000,
        CODTIPTIT: 7,
        DESCRTIPTIT: "Boleto",
        CODNAT: 101,
        DESCRNAT: "Venda de produtos",
        DTNEG: "2026-07-01",
        DTVENC: "2026-07-15",
        valor_aberto: 987.65,
        dias_atraso: 8,
      },
    ],
  };

  const files = arquivosExcel(await gerarFinanceiroXlsxDoPayload(payload, {
    ...argsBase,
    tipo: payload.tipo,
  }));
  const workbook = new TextDecoder().decode(files["xl/workbook.xml"]);
  const xml = xmlCompleto(files);

  assert.match(workbook, /name="Contas a receber"/);
  for (const texto of ["Cliente de teste", "Venda de produtos", "Boleto", "Valor em aberto"]) {
    assert.ok(xml.includes(texto), `conteudo ausente no Excel: ${texto}`);
  }
});

test("gera contas a pagar e movimentos financeiros", async () => {
  const contas: FinanceiroExportPayload = {
    tipo: "contas-pagar",
    contas: [{
      NUFIN: 456,
      CODEMP: 2,
      CODPARC: 88,
      NOMEPARC: "Fornecedor de teste",
      CODCENCUS: null,
      CODPROJ: null,
      CODTIPTIT: null,
      DESCRTIPTIT: null,
      CODNAT: null,
      DESCRNAT: null,
      DTNEG: "2026-07-02",
      DTVENC: "2026-07-20",
      valor_aberto: 500,
      dias_atraso: 3,
    }],
  };
  const movimentos: FinanceiroExportPayload = {
    tipo: "movimentos",
    movimentos: [{
      nufin: 789,
      data_baixa: "2026-07-10",
      tipo: "pagar",
      parceiro: "Fornecedor de movimento",
      natureza: "Despesa administrativa",
      projeto: "Empresa B",
      centro: "Administrativo",
      valor: 250,
    }],
  };

  const arquivosContas = arquivosExcel(await gerarFinanceiroXlsxDoPayload(contas, {
    ...argsBase,
    tipo: contas.tipo,
  }));
  const arquivosMovimentos = arquivosExcel(await gerarFinanceiroXlsxDoPayload(movimentos, {
    ...argsBase,
    tipo: movimentos.tipo,
  }));
  const workbookContas = new TextDecoder().decode(arquivosContas["xl/workbook.xml"]);
  const workbookMovimentos = new TextDecoder().decode(arquivosMovimentos["xl/workbook.xml"]);
  const xmlMovimentos = xmlCompleto(arquivosMovimentos);

  assert.match(workbookContas, /name="Contas a pagar"/);
  assert.match(workbookMovimentos, /name="Movimentos"/);
  for (const texto of ["Fornecedor de movimento", "Pagamento", "Administrativo"]) {
    assert.ok(xmlMovimentos.includes(texto), `conteudo ausente no Excel: ${texto}`);
  }
});
