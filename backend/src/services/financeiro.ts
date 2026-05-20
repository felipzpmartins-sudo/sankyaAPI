import { loadRecords } from "../sankhya/crud.js";
import type { EmpresaFiltro } from "../utils/empresa.js";

const FIELDS = [
  "NUFIN",
  "CODPARC",
  "DTNEG",
  "DTVENC",
  "DHBAIXA",
  "VLRDESDOB",
  "VLRBAIXA",
  "RECDESP",
  "CODTIPTIT",
  "CODNAT",
  "CODEMP",
];

function num(v: string | null): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDateBR(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
}

export type Titulo = {
  nufin: number;
  codParc: number;
  dataNegociacao: string | null;
  dataVencimento: string | null;
  dataBaixa: string | null;
  valorOriginal: number;
  valorBaixa: number;
  valorAberto: number;
  tipo: "receita" | "despesa";
  codEmpresa: number;
  parceiroNome: string | null;
  tipoTitulo: string | null;
  natureza: string | null;
  empresaNome: string | null;
};

function empresaToExpression(filtro: EmpresaFiltro): string {
  if (filtro.modo === "todas") return "";
  if (filtro.ids.length === 1) return `this.CODEMP = ${filtro.ids[0]}`;
  return `this.CODEMP IN (${filtro.ids.join(",")})`;
}

export async function listarTitulos(opts: {
  empresa: EmpresaFiltro;
  tipo: "receita" | "despesa";
  emAberto?: boolean;
  page?: number;
}): Promise<{ rows: Titulo[]; total: number; hasMore: boolean }> {
  const sinal = opts.tipo === "receita" ? ">" : "<";
  const abertoFilter = opts.emAberto !== false ? "this.DHBAIXA IS NULL" : "";
  const empresaClause = empresaToExpression(opts.empresa);

  const parts = [empresaClause, `this.RECDESP ${sinal} 0`, abertoFilter].filter(Boolean);
  const expression = parts.join(" AND ");

  const result = await loadRecords({
    rootEntity: "Financeiro",
    fields: FIELDS,
    expression,
    offsetPage: opts.page ?? 0,
  });

  const rows: Titulo[] = result.rows.map((r) => {
    const valorOriginal = num(r.VLRDESDOB);
    const valorBaixa = num(r.VLRBAIXA);
    return {
      nufin: Number(r.NUFIN),
      codParc: Number(r.CODPARC),
      dataNegociacao: parseDateBR(r.DTNEG),
      dataVencimento: parseDateBR(r.DTVENC),
      dataBaixa: parseDateBR(r.DHBAIXA),
      valorOriginal,
      valorBaixa,
      valorAberto: valorOriginal - valorBaixa,
      tipo: Number(r.RECDESP) > 0 ? "receita" : "despesa",
      codEmpresa: Number(r.CODEMP),
      parceiroNome: r.Parceiro_NOMEPARC ?? null,
      tipoTitulo: r.TipoTitulo_DESCRTIPTIT ?? null,
      natureza: r.Natureza_DESCRNAT ?? null,
      empresaNome: r.Empresa_NOMEFANTASIA ?? null,
    };
  });

  return { rows, total: result.total, hasMore: result.hasMore };
}
