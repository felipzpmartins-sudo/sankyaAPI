import writeXlsxFile, { type Cell, type SheetData } from "write-excel-file/node";
import { produtosSemVenda } from "./comercial.js";
import type { EmpresaFiltro } from "../utils/empresa.js";
import type { VendedorFiltro } from "../utils/vendedor.js";

const COR_CABECALHO = "#17365D";
const COR_TEXTO_CABECALHO = "#FFFFFF";
const FORMATO_DATA = "dd/mm/yyyy";
const FORMATO_DATA_HORA = "dd/mm/yyyy hh:mm";
const FORMATO_QTD = "#,##0.##";

function cabecalho(value: string): Cell {
  return {
    value,
    fontWeight: "bold",
    textColor: COR_TEXTO_CABECALHO,
    backgroundColor: COR_CABECALHO,
    align: "center",
  };
}

function data(value: string | null | undefined): Cell | string {
  if (!value) return "";
  const pura = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!pura) return value;
  return {
    value: new Date(Date.UTC(Number(pura[1]), Number(pura[2]) - 1, Number(pura[3]))),
    type: Date,
    format: FORMATO_DATA,
  };
}

export type ProdutosSemVendaArgs = {
  empresa: EmpresaFiltro;
  vendedor: VendedorFiltro;
  periodo: { dataInicio: string; dataFim: string };
};

/**
 * Planilha dos produtos ativos que não venderam no período.
 *
 * Duas abas: o resumo com os cortes que explicam o número, e a lista. Sem o
 * resumo alguém abre a lista com 2.516 linhas e conclui a coisa errada — a
 * maioria nunca vendeu no histórico, e é bem diferente de ter parado.
 */
function resumoSheet(
  r: ReturnType<typeof produtosSemVenda>,
  args: ProdutosSemVendaArgs,
): SheetData {
  return [
    [cabecalho("Informação"), cabecalho("Valor")],
    ["Período analisado", `${args.periodo.dataInicio} a ${args.periodo.dataFim}`],
    ["Empresas", args.empresa.modo === "todas" ? "Todas" : args.empresa.ids.join(", ")],
    ["Histórico disponível a partir de", data(r.inicio_do_historico)],
    ["", ""],
    ["Produtos ativos no cadastro", r.total_ativos],
    ["Sem venda faturada no período", r.sem_venda],
    ["  destes, pararam de vender", r.pararam_de_vender],
    ["  destes, nunca venderam na janela", r.nunca_na_janela],
    ["Com estoque em mãos", r.com_estoque],
    ["", ""],
    ["Gerado em", { value: new Date(), type: Date, format: FORMATO_DATA_HORA }],
  ];
}

function listaSheet(r: ReturnType<typeof produtosSemVenda>): SheetData {
  return [
    [
      cabecalho("Código"),
      cabecalho("Produto"),
      cabecalho("Grupo"),
      cabecalho("Estoque atual"),
      cabecalho("Última venda"),
      cabecalho("Dias sem vender"),
      cabecalho("Situação"),
    ],
    ...r.produtos.map((p) => [
      p.CODPROD,
      p.produto,
      p.grupo ?? "",
      { value: p.estoque, type: Number, format: FORMATO_QTD } as Cell,
      data(p.ultima_venda),
      p.dias_sem_vender ?? "",
      p.parou_de_vender ? "Parou de vender" : "Sem venda no histórico",
    ]),
  ];
}

export async function gerarProdutosSemVendaXlsx(
  args: ProdutosSemVendaArgs,
): Promise<Buffer> {
  // O limite alto é proposital: planilha existe justamente para levar a lista
  // inteira, diferente da tela que pagina.
  const resultado = produtosSemVenda({ ...args, limite: 3_000 });

  return writeXlsxFile([
    {
      data: resumoSheet(resultado, args),
      sheet: "Resumo",
      columns: [{ width: 38 }, { width: 26 }],
      stickyRowsCount: 1,
    },
    {
      data: listaSheet(resultado),
      sheet: "Sem venda",
      columns: [
        { width: 11 }, { width: 52 }, { width: 26 }, { width: 15 },
        { width: 15 }, { width: 17 }, { width: 24 },
      ],
      stickyRowsCount: 1,
      orientation: "landscape" as const,
    },
  ]).toBuffer();
}
