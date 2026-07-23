import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/node";

import type { EmpresaFiltro } from "../utils/empresa.js";
import {
  drePorProjeto,
  listarContasAbertas,
} from "./dashboard-financeiro.js";
import {
  listarMovimentosFinanceiros,
  type MovimentoFinanceiro,
} from "./executivo.js";

const COR_CABECALHO = "#17365D";
const COR_TEXTO_CABECALHO = "#FFFFFF";
const FORMATO_VALOR = "#,##0.00";
const FORMATO_PERCENTUAL = '0.00"%"';
const FORMATO_DATA = "dd/mm/yyyy";
const FORMATO_DATA_HORA = "dd/mm/yyyy hh:mm";

export type FinanceiroExportTipo =
  | "dre-comparativo"
  | "contas-receber"
  | "contas-pagar"
  | "movimentos";

export type FinanceiroExportArgs = {
  tipo: FinanceiroExportTipo;
  filtro: EmpresaFiltro;
  dataInicio: string;
  dataFim: string;
  codProj?: number[];
};

type DreExport = ReturnType<typeof drePorProjeto>;
type ContaExport = ReturnType<typeof listarContasAbertas>["titulos"][number];

export type FinanceiroExportPayload =
  | { tipo: "dre-comparativo"; dre: DreExport }
  | { tipo: "contas-receber" | "contas-pagar"; contas: ContaExport[] }
  | { tipo: "movimentos"; movimentos: MovimentoFinanceiro[] };

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

function percentual(value: number): Cell {
  return { value, type: Number, format: FORMATO_PERCENTUAL };
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

function nomeFiltroEmpresa(filtro: EmpresaFiltro): string {
  return filtro.modo === "todas" ? "Todas" : filtro.ids.join(", ");
}

function filtrosSheet(args: FinanceiroExportArgs, totalRegistros: number): SheetData {
  return [
    [cabecalho("Filtro"), cabecalho("Valor")],
    ["Relatório", nomeRelatorio(args.tipo)],
    ["Data inicial", data(args.dataInicio)],
    ["Data final", data(args.dataFim)],
    ["Empresas", nomeFiltroEmpresa(args.filtro)],
    ["Projetos", args.codProj?.length ? args.codProj.join(", ") : "Todos"],
    ["Total de registros", totalRegistros],
    ["Gerado em", { value: new Date(), type: Date, format: FORMATO_DATA_HORA }],
  ];
}

function nomeRelatorio(tipo: FinanceiroExportTipo): string {
  switch (tipo) {
    case "dre-comparativo":
      return "DRE comparativo por projeto";
    case "contas-receber":
      return "Contas a receber";
    case "contas-pagar":
      return "Contas a pagar";
    case "movimentos":
      return "Movimentos financeiros";
  }
}

function dreSheet(dre: DreExport): SheetData {
  const linhas = [
    { key: "receita_bruta", label: "Receita bruta", negativo: false, percentual: false },
    { key: "custos", label: "Custos / Estoques", negativo: true, percentual: false },
    { key: "despesas_admin", label: "Despesas administrativas", negativo: true, percentual: false },
    { key: "despesas_comerciais", label: "Despesas comerciais", negativo: true, percentual: false },
    { key: "impostos", label: "Impostos / Tributos", negativo: true, percentual: false },
    { key: "resultado_operacional", label: "Resultado operacional", negativo: false, percentual: false },
    { key: "margem_pct", label: "Margem", negativo: false, percentual: true },
  ] as const;

  return [
    [
      cabecalho("Categoria"),
      ...dre.projetos.map((projeto) => cabecalho(projeto.nome.replace("Projeto ", ""))),
      cabecalho("Consolidado"),
    ],
    ...linhas.map((linha) => [
      linha.label,
      ...dre.projetos.map((projeto) => {
        const numero = Number(projeto[linha.key]);
        if (linha.percentual) return percentual(numero);
        return valor(linha.negativo ? -numero : numero);
      }),
      linha.percentual
        ? percentual(Number(dre.consolidado[linha.key]))
        : valor(linha.negativo
          ? -Number(dre.consolidado[linha.key])
          : Number(dre.consolidado[linha.key])),
    ]),
  ];
}

function contasSheet(contas: ContaExport[]): SheetData {
  return [
    [
      cabecalho("NUFIN"),
      cabecalho("Empresa"),
      cabecalho("Parceiro"),
      cabecalho("Data da negociação"),
      cabecalho("Vencimento"),
      cabecalho("Natureza"),
      cabecalho("Projeto"),
      cabecalho("Centro de resultado"),
      cabecalho("Tipo de título"),
      cabecalho("Valor em aberto"),
      cabecalho("Dias em atraso"),
    ],
    ...contas.map((conta) => [
      conta.NUFIN,
      conta.CODEMP,
      conta.NOMEPARC ?? "Sem parceiro",
      data(conta.DTNEG),
      data(conta.DTVENC),
      conta.DESCRNAT ?? (conta.CODNAT == null ? "Sem natureza" : `Natureza ${conta.CODNAT}`),
      conta.CODPROJ ?? "",
      conta.CODCENCUS ?? "",
      conta.DESCRTIPTIT ?? (conta.CODTIPTIT == null ? "" : `Tipo ${conta.CODTIPTIT}`),
      valor(conta.valor_aberto),
      conta.dias_atraso,
    ]),
  ];
}

function movimentosSheet(movimentos: MovimentoFinanceiro[]): SheetData {
  return [
    [
      cabecalho("NUFIN"),
      cabecalho("Data da baixa"),
      cabecalho("Tipo"),
      cabecalho("Parceiro"),
      cabecalho("Natureza"),
      cabecalho("Projeto"),
      cabecalho("Centro de resultado"),
      cabecalho("Valor"),
    ],
    ...movimentos.map((movimento) => [
      movimento.nufin,
      data(movimento.data_baixa),
      movimento.tipo === "receber" ? "Recebimento" : "Pagamento",
      movimento.parceiro,
      movimento.natureza,
      movimento.projeto,
      movimento.centro,
      valor(movimento.valor),
    ]),
  ];
}

function listarTodasContas(
  args: FinanceiroExportArgs,
  tipo: "receber" | "pagar",
): ContaExport[] {
  const pageSize = 200;
  const primeiraPagina = listarContasAbertas({
    filtro: args.filtro,
    tipo,
    page: 0,
    pageSize,
    dataInicio: args.dataInicio,
    dataFim: args.dataFim,
    codProj: args.codProj,
  });
  const contas = [...primeiraPagina.titulos];
  const paginas = Math.ceil(primeiraPagina.total / pageSize);

  for (let page = 1; page < paginas; page += 1) {
    contas.push(...listarContasAbertas({
      filtro: args.filtro,
      tipo,
      page,
      pageSize,
      dataInicio: args.dataInicio,
      dataFim: args.dataFim,
      codProj: args.codProj,
    }).titulos);
  }

  return contas;
}

export async function gerarFinanceiroXlsxDoPayload(
  payload: FinanceiroExportPayload,
  args: FinanceiroExportArgs,
): Promise<Buffer> {
  const principal = payload.tipo === "dre-comparativo"
    ? {
        data: dreSheet(payload.dre),
        sheet: "DRE por projeto",
        columns: [
          { width: 30 },
          ...payload.dre.projetos.map(() => ({ width: 22 })),
          { width: 22 },
        ],
        stickyRowsCount: 1,
        orientation: "landscape" as const,
      }
    : payload.tipo === "movimentos"
      ? {
          data: movimentosSheet(payload.movimentos),
          sheet: "Movimentos",
          columns: [
            { width: 14 }, { width: 17 }, { width: 16 }, { width: 34 },
            { width: 35 }, { width: 35 }, { width: 30 }, { width: 18 },
          ],
          stickyRowsCount: 1,
          orientation: "landscape" as const,
        }
      : {
          data: contasSheet(payload.contas),
          sheet: payload.tipo === "contas-receber" ? "Contas a receber" : "Contas a pagar",
          columns: [
            { width: 14 }, { width: 12 }, { width: 34 }, { width: 19 },
            { width: 17 }, { width: 35 }, { width: 16 }, { width: 20 },
            { width: 25 }, { width: 18 }, { width: 16 },
          ],
          stickyRowsCount: 1,
          orientation: "landscape" as const,
        };
  const totalRegistros = payload.tipo === "dre-comparativo"
    ? payload.dre.projetos.length
    : payload.tipo === "movimentos"
      ? payload.movimentos.length
      : payload.contas.length;

  return writeXlsxFile([
    {
      data: filtrosSheet(args, totalRegistros),
      sheet: "Filtros",
      columns: [{ width: 30 }, { width: 60 }],
      stickyRowsCount: 1,
    },
    principal,
  ]).toBuffer();
}

export async function gerarFinanceiroXlsx(args: FinanceiroExportArgs): Promise<Buffer> {
  switch (args.tipo) {
    case "dre-comparativo": {
      const dre = drePorProjeto(args.filtro, "ano", {
        dataInicio: args.dataInicio,
        dataFim: args.dataFim,
        codProj: args.codProj,
      });
      return gerarFinanceiroXlsxDoPayload({ tipo: args.tipo, dre }, args);
    }
    case "contas-receber": {
      const contas = listarTodasContas(args, "receber");
      return gerarFinanceiroXlsxDoPayload({ tipo: args.tipo, contas }, args);
    }
    case "contas-pagar": {
      const contas = listarTodasContas(args, "pagar");
      return gerarFinanceiroXlsxDoPayload({ tipo: args.tipo, contas }, args);
    }
    case "movimentos": {
      const movimentos = listarMovimentosFinanceiros(
        args.filtro,
        { dataInicio: args.dataInicio, dataFim: args.dataFim },
        args.codProj,
      );
      return gerarFinanceiroXlsxDoPayload({ tipo: args.tipo, movimentos }, args);
    }
  }
}
