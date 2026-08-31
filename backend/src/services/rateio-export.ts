import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/node";
import {
  rateioDiagnosticoCompleto,
  type RateioDiagnosticoArgs,
  type RateioDiagnosticoCompleto,
  type RateioDiagnosticoItem,
} from "./dashboard-financeiro.js";
import { projetosEmpresaDestino } from "./rateio-classification.js";

const COR_CABECALHO = "#17365D";
const COR_TEXTO_CABECALHO = "#FFFFFF";
const FORMATO_VALOR = "#,##0.00";
const FORMATO_PERCENTUAL = '0.00"%"';
const FORMATO_DATA = "dd/mm/yyyy";
const FORMATO_DATA_HORA = "dd/mm/yyyy hh:mm";

function cabecalho(value: string): Cell {
  return {
    value,
    fontWeight: "bold",
    textColor: COR_TEXTO_CABECALHO,
    backgroundColor: COR_CABECALHO,
    align: "center",
  };
}

function valor(value: number): Cell {
  return { value, type: Number, format: FORMATO_VALOR };
}

function percentual(value: number | undefined): Cell {
  return { value: value ?? 0, type: Number, format: FORMATO_PERCENTUAL };
}

function data(value: string | null | undefined): Cell | string {
  if (!value) return "";
  const dataPura = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!dataPura) return value;
  return {
    value: new Date(Date.UTC(
      Number(dataPura[1]),
      Number(dataPura[2]) - 1,
      Number(dataPura[3]),
    )),
    type: Date,
    format: FORMATO_DATA,
  };
}

function dataHora(value: string | null | undefined): Cell | string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return { value: parsed, type: Date, format: FORMATO_DATA_HORA };
}

function quantidadeDestinos(item: RateioDiagnosticoItem): number {
  return new Set(
    (item.distribuicao ?? [])
      .filter((linha) => linha.empresa_destino && linha.percentual > 0 && linha.codproj != null)
      .map((linha) => linha.codproj),
  ).size;
}

function todasCategorias(args: ReturnType<typeof rateioDiagnosticoCompleto>): RateioDiagnosticoItem[] {
  return [
    ...args.com_rateio,
    ...args.nao_rateio,
    ...args.sem_rateio,
    ...args.rateio_incompleto,
  ].sort((a, b) => a.nufin - b.nufin || a.status.localeCompare(b.status));
}

function resumoSheet(
  diagnostico: ReturnType<typeof rateioDiagnosticoCompleto>,
  args: RateioDiagnosticoArgs,
): SheetData {
  const empresas = Array.isArray(args.codEmp)
    ? args.codEmp.join(", ")
    : args.codEmp == null
      ? "Todas"
      : String(args.codEmp);
  const projetos = args.codProj && args.codProj.length > 0 ? args.codProj.join(", ") : "Todos";
  const resumo = diagnostico.resumo;

  return [
    [cabecalho("Campo"), cabecalho("Valor")],
    ["Status da base", diagnostico.status],
    ["Mensagem", diagnostico.mensagem ?? ""],
    ["Data inicial", data(diagnostico.periodo.dataInicio)],
    ["Data final", data(diagnostico.periodo.dataFim)],
    ["Empresas de origem filtradas", empresas],
    ["Projetos filtrados", projetos],
    ["Projetos que representam empresas de destino", projetosEmpresaDestino().join(", ")],
    ["Snapshot dos titulos", dataHora(diagnostico.snapshot_at)],
    ["Gerado em", { value: new Date(), type: Date, format: FORMATO_DATA_HORA }],
    ["Total de titulos", resumo.total_titulos],
    ["COM_RATEIO (2+ destinos)", resumo.com_rateio_ok],
    ["NAO_RATEIO (1 destino)", resumo.nao_rateio],
    ["SEM_RATEIO", resumo.sem_rateio],
    ["RATEIO_INCOMPLETO", resumo.rateio_incompleto],
    ["Titulos validos", resumo.titulos_validos],
    ["Percentual de qualidade", percentual(resumo.percentual_ok)],
    ["Pendencias", resumo.pendencias],
    ["Valor COM_RATEIO", valor(resumo.valor_com_rateio)],
    ["Valor NAO_RATEIO", valor(resumo.valor_nao_rateio)],
    ["Valor das pendencias", valor(resumo.valor_pendencias)],
    ["Valor SEM_RATEIO", valor(resumo.valor_sem_rateio)],
    ["Valor RATEIO_INCOMPLETO", valor(resumo.valor_rateio_incompleto)],
    ["Valor rateado real", valor(resumo.valor_rateado_total)],
    ["Titulos com percentual fora dos destinos", resumo.titulos_sem_projeto],
    ["Valor fora dos destinos", valor(resumo.valor_sem_projeto)],
  ];
}

function titulosSheet(items: RateioDiagnosticoItem[]): SheetData {
  return [
    [
      "Status",
      "NUFIN",
      "Origem",
      "NUNOTA",
      "CODEMP origem",
      "Empresa origem",
      "Parceiro",
      "Tipo",
      "DTNEG",
      "DTVENC",
      "DHBAIXA",
      "Em aberto",
      "VLRDESDOB",
      "VLRBAIXA",
      "Valor em aberto",
      "CODPROJ titulo",
      "Projeto titulo",
      "CODNAT",
      "Natureza",
      "CODCENCUS",
      "Centro de resultado",
      "Resumo da distribuicao",
      "Percentual total",
      "Percentual em destinos validos",
      "Quantidade de destinos",
      "Valor fora dos destinos",
      "Alerta",
    ].map(cabecalho),
    ...items.map((item) => [
      item.status,
      item.nufin,
      "TGFFIN",
      item.nunota,
      item.codemp,
      item.empresa ?? "",
      item.parceiro ?? "",
      item.tipo,
      data(item.data),
      data(item.vencimento),
      data(item.baixa),
      item.em_aberto ? "SIM" : "NAO",
      valor(item.valor),
      valor(item.valor_baixado),
      valor(item.valor_aberto),
      item.titulo_codproj,
      item.titulo_projeto ?? "",
      item.codnat,
      item.natureza ?? "",
      item.codcencus,
      item.centro_resultado ?? "",
      item.projeto ?? "",
      percentual(item.total_perc),
      percentual(item.percentual_valido),
      quantidadeDestinos(item),
      valor(item.valor_sem_projeto ?? 0),
      item.alerta ?? "",
    ]),
  ];
}

function distribuicaoSheet(items: RateioDiagnosticoItem[]): SheetData {
  const linhas: SheetData = [[
    "Status do titulo",
    "NUFIN",
    "NUNOTA",
    "CODEMP origem",
    "Empresa origem",
    "Parceiro",
    "CODPROJ titulo",
    "Projeto titulo",
    "CODPROJ destino",
    "Empresa/projeto destino",
    "Destino empresarial valido",
    "Percentual",
    "Valor proporcional do titulo",
    "Valor proporcional baixado",
    "Valor proporcional em aberto",
    "Alerta",
  ].map(cabecalho)];

  for (const item of items) {
    for (const linha of item.distribuicao ?? []) {
      linhas.push([
        item.status,
        item.nufin,
        item.nunota,
        item.codemp,
        item.empresa ?? "",
        item.parceiro ?? "",
        item.titulo_codproj,
        item.titulo_projeto ?? "",
        linha.codproj,
        linha.projeto ?? "",
        linha.empresa_destino ? "SIM" : "NAO",
        percentual(linha.percentual),
        valor(linha.valor),
        valor(linha.valor_baixado),
        valor(linha.valor_aberto),
        item.alerta ?? "",
      ]);
    }
  }
  return linhas;
}

function porEmpresaProjetoSheet(
  diagnostico: ReturnType<typeof rateioDiagnosticoCompleto>,
): SheetData {
  return [
    [
      "CODPROJ / empresa destino",
      "Empresa/projeto destino",
      "Titulos com rateio real",
      "Linhas de distribuicao",
      "Valor rateado",
      "Participacao no rateio real (%)",
    ].map(cabecalho),
    ...diagnostico.rateio_por_projeto.map((row) => [
      row.codproj,
      row.projeto,
      row.despesas,
      row.linhas,
      valor(row.valor_rateado),
      percentual(row.percentual),
    ]),
  ];
}

export async function gerarRateioXlsxDoDiagnostico(
  diagnostico: RateioDiagnosticoCompleto,
  args: RateioDiagnosticoArgs,
): Promise<Buffer> {
  const items = todasCategorias(diagnostico);

  return writeXlsxFile([
    {
      data: resumoSheet(diagnostico, args),
      sheet: "Resumo",
      columns: [{ width: 43 }, { width: 60 }],
      stickyRowsCount: 1,
    },
    {
      data: titulosSheet(items),
      sheet: "Titulos",
      columns: [
        { width: 21 }, { width: 13 }, { width: 12 }, { width: 13 }, { width: 15 },
        { width: 28 }, { width: 32 }, { width: 12 }, { width: 13 }, { width: 13 },
        { width: 13 }, { width: 12 }, { width: 15 }, { width: 15 }, { width: 15 },
        { width: 17 }, { width: 28 }, { width: 13 }, { width: 28 }, { width: 15 },
        { width: 28 }, { width: 30 }, { width: 18 }, { width: 26 }, { width: 22 },
        { width: 22 }, { width: 55 },
      ],
      stickyRowsCount: 1,
      orientation: "landscape",
    },
    {
      data: distribuicaoSheet(items),
      sheet: "Distribuicao",
      columns: [
        { width: 21 }, { width: 13 }, { width: 13 }, { width: 15 }, { width: 28 },
        { width: 32 }, { width: 17 }, { width: 28 }, { width: 18 }, { width: 30 },
        { width: 24 }, { width: 15 }, { width: 25 }, { width: 27 }, { width: 28 },
        { width: 55 },
      ],
      stickyRowsCount: 1,
      orientation: "landscape",
    },
    {
      data: porEmpresaProjetoSheet(diagnostico),
      sheet: "Por empresa-projeto",
      columns: [
        { width: 27 }, { width: 35 }, { width: 23 }, { width: 23 }, { width: 18 }, { width: 31 },
      ],
      stickyRowsCount: 1,
    },
  ]).toBuffer();
}

export async function gerarRateioXlsx(args: RateioDiagnosticoArgs): Promise<Buffer> {
  return gerarRateioXlsxDoDiagnostico(rateioDiagnosticoCompleto(args), args);
}
