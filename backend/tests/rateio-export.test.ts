import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";
import {
  gerarRateioXlsxDoDiagnostico,
} from "../src/services/rateio-export.js";
import type {
  RateioDiagnosticoCompleto,
  RateioDiagnosticoItem,
} from "../src/services/dashboard-financeiro.js";

function item(
  nufin: number,
  status: RateioDiagnosticoItem["status"],
  distribuicao: NonNullable<RateioDiagnosticoItem["distribuicao"]> = [],
): RateioDiagnosticoItem {
  return {
    nufin,
    nunota: 90_000 + nufin,
    codemp: 1,
    empresa: "Empresa de origem",
    codcencus: 10,
    centro_resultado: "Administrativo",
    codnat: 20,
    natureza: "Despesa operacional",
    codproj: distribuicao.length === 1 ? distribuicao[0].codproj : null,
    titulo_codproj: 40_100_000,
    titulo_projeto: "Projeto do titulo",
    valor: 1_000,
    valor_baixado: 800,
    valor_aberto: 200,
    data: "2026-07-01",
    vencimento: "2026-07-10",
    baixa: "2026-07-08",
    em_aberto: false,
    tipo: "PAGAR",
    parceiro: "Fornecedor de teste",
    projeto: distribuicao.map((linha) => linha.projeto).join(" / ") || null,
    status,
    total_perc: distribuicao.reduce((total, linha) => total + linha.percentual, 0),
    percentual_valido: distribuicao
      .filter((linha) => linha.empresa_destino)
      .reduce((total, linha) => total + linha.percentual, 0),
    valor_sem_projeto: distribuicao
      .filter((linha) => !linha.empresa_destino)
      .reduce((total, linha) => total + linha.valor, 0),
    alerta: status === "RATEIO_INCOMPLETO" ? "20% fora dos destinos permitidos" : undefined,
    distribuicao,
  };
}

test("gera Excel auditavel com todos os status e cada linha da distribuicao", async () => {
  const comRateio = item(1, "COM_RATEIO", [
    { codproj: 40_100_000, projeto: "Empresa destino A", percentual: 60, valor: 600, valor_baixado: 480, valor_aberto: 120, empresa_destino: true },
    { codproj: 40_200_000, projeto: "Empresa destino B", percentual: 40, valor: 400, valor_baixado: 320, valor_aberto: 80, empresa_destino: true },
  ]);
  const naoRateio = item(2, "NAO_RATEIO", [
    { codproj: 40_300_000, projeto: "Empresa destino C", percentual: 100, valor: 1_000, valor_baixado: 800, valor_aberto: 200, empresa_destino: true },
  ]);
  const semRateio = item(3, "SEM_RATEIO");
  const incompleto = item(4, "RATEIO_INCOMPLETO", [
    { codproj: 40_400_000, projeto: "Empresa destino D", percentual: 80, valor: 800, valor_baixado: 640, valor_aberto: 160, empresa_destino: true },
    { codproj: 123, projeto: "Projeto invalido", percentual: 20, valor: 200, valor_baixado: 160, valor_aberto: 40, empresa_destino: false },
  ]);

  const diagnostico: RateioDiagnosticoCompleto = {
    status: "OK",
    periodo: { dataInicio: "2026-07-01", dataFim: "2026-07-31" },
    resumo: {
      total_titulos: 4,
      com_rateio_ok: 1,
      nao_rateio: 1,
      sem_rateio: 1,
      rateio_incompleto: 1,
      titulos_validos: 2,
      percentual_ok: 50,
      pendencias: 2,
      valor_com_rateio: 1_000,
      valor_nao_rateio: 1_000,
      valor_pendencias: 2_000,
      valor_sem_rateio: 1_000,
      valor_rateio_incompleto: 1_000,
      titulos_sem_projeto: 1,
      valor_sem_projeto: 200,
      valor_rateado_total: 1_000,
    },
    com_rateio: [comRateio],
    nao_rateio: [naoRateio],
    sem_rateio: [semRateio],
    rateio_incompleto: [incompleto],
    rateio_por_projeto: [
      { codproj: 40_100_000, projeto: "Empresa destino A", despesas: 1, linhas: 1, valor_rateado: 600, percentual: 60 },
      { codproj: 40_200_000, projeto: "Empresa destino B", despesas: 1, linhas: 1, valor_rateado: 400, percentual: 40 },
    ],
    snapshot_at: "2026-07-22T12:00:00.000Z",
  };

  const buffer = await gerarRateioXlsxDoDiagnostico(diagnostico, {
    dataInicio: "2026-07-01",
    dataFim: "2026-07-31",
  });

  assert.equal(buffer.subarray(0, 4).toString("hex"), "504b0304");
  const files = unzipSync(new Uint8Array(buffer));
  const workbook = new TextDecoder().decode(files["xl/workbook.xml"]);
  for (const sheet of ["Resumo", "Titulos", "Distribuicao", "Por empresa-projeto"]) {
    assert.match(workbook, new RegExp(`name="${sheet}"`));
  }

  const titulosXml = new TextDecoder().decode(files["xl/worksheets/sheet2.xml"]);
  const distribuicaoXml = new TextDecoder().decode(files["xl/worksheets/sheet3.xml"]);
  const estilosXml = new TextDecoder().decode(files["xl/styles.xml"]);
  assert.equal((titulosXml.match(/<row\b/g) ?? []).length, 5, "cabecalho + quatro titulos");
  assert.equal((distribuicaoXml.match(/<row\b/g) ?? []).length, 6, "cabecalho + cinco parcelas");
  assert.ok(estilosXml.includes("dd/mm/yyyy"), "datas devem ser celulas formatadas do Excel");

  const xmlCompleto = Object.entries(files)
    .filter(([name]) => name.endsWith(".xml"))
    .map(([, bytes]) => new TextDecoder().decode(bytes))
    .join("\n");
  for (const texto of [
    "COM_RATEIO",
    "NAO_RATEIO",
    "SEM_RATEIO",
    "RATEIO_INCOMPLETO",
    "VLRDESDOB",
    "VLRBAIXA",
    "Quantidade de destinos",
    "Valor proporcional baixado",
    "Valor proporcional em aberto",
    "Projeto invalido",
  ]) {
    assert.ok(xmlCompleto.includes(texto), `conteudo ausente no Excel: ${texto}`);
  }
  assert.ok(!xmlCompleto.includes("2026-07-01"), "datas nao devem ser gravadas como texto");
});
