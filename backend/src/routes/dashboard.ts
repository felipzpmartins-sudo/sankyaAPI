import { Router } from "express";
import { z } from "zod";
import {
  distribuicaoDespesas,
  dre,
  drePorProjeto,
  financeiroResumo,
  fluxoCaixa,
  listarCentrosResultado,
  listarContasAbertas,
  listarProjetos,
  listarRateio,
  rateioDiagnostico,
} from "../services/dashboard-financeiro.js";
import { clientesBI, rhBI } from "../services/dashboard-clientes-rh.js";
import { entregasBI } from "../services/dashboard-entregas.js";
import { executivoResumo } from "../services/executivo.js";
import {
  gerarFinanceiroXlsx,
  type FinanceiroExportTipo,
} from "../services/financeiro-export.js";
import { gerarRateioXlsx } from "../services/rateio-export.js";
import {
  comodatoConsolidado,
  empresasResumo,
  faturamentoConsolidado,
  faturamentoPorEmpresa,
  listarEmpresas,
  listarProdutos,
  listarVendedores,
  lancamentosHoje,
  vendedoresRanking,
} from "../services/dashboard.js";
import { estoqueVisaoGeral, listarLocaisEstoque } from "../services/dashboard-estoque.js";
import { empresaParam } from "../utils/empresa.js";
import { vendedorParam } from "../utils/vendedor.js";

export const dashboardRouter = Router();

const numberListParam = z
  .string()
  .regex(/^\d+(,\d+)*$/)
  .transform((v) => v.split(",").map((n) => Number(n)));

const faturamentoQuery = z.object({
  empresa: empresaParam,
  vendedor: vendedorParam,
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  codProj: numberListParam.optional(),
}).refine((q) => (q.dataInicio === undefined) === (q.dataFim === undefined), {
  message: "Informe dataInicio e dataFim juntos.",
}).refine((q) => !q.dataInicio || !q.dataFim || q.dataInicio <= q.dataFim, {
  message: "dataInicio deve ser menor ou igual a dataFim.",
});

const faturamentoPorEmpresaQuery = z.object({
  empresa: empresaParam,
  vendedor: vendedorParam,
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  codProj: numberListParam.optional(),
  periodo: z.enum(["dia", "mes", "ano"]).default("ano"),
}).refine((q) => (q.dataInicio === undefined) === (q.dataFim === undefined), {
  message: "Informe dataInicio e dataFim juntos.",
}).refine((q) => !q.dataInicio || !q.dataFim || q.dataInicio <= q.dataFim, {
  message: "dataInicio deve ser menor ou igual a dataFim.",
});

dashboardRouter.get("/empresa/faturamento", (req, res, next) => {
  try {
    const { empresa, vendedor, data, dataInicio, dataFim, codProj } = faturamentoQuery.parse(req.query);
    res.json(faturamentoConsolidado(empresa, vendedor, data, { dataInicio, dataFim, codProj }));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/empresa/faturamento-por-empresa", (req, res, next) => {
  try {
    const { empresa, vendedor, data, periodo, dataInicio, dataFim, codProj } = faturamentoPorEmpresaQuery.parse(req.query);
    res.json(faturamentoPorEmpresa(empresa, vendedor, data, periodo, { dataInicio, dataFim, codProj }));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/empresa/resumo", (req, res, next) => {
  try {
    const { empresa, vendedor, data, dataInicio, dataFim, codProj } = faturamentoQuery.parse(req.query);
    const { periodo } = z.object({ periodo: z.enum(["dia", "mes", "ano"]).default("ano") }).parse(req.query);
    res.json(empresasResumo(empresa, vendedor, data, periodo, { dataInicio, dataFim, codProj }));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/executivo", (req, res, next) => {
  try {
    const { empresa, vendedor, dataInicio, dataFim, codProj } = faturamentoQuery.parse(req.query);
    res.json(executivoResumo(empresa, vendedor, { dataInicio, dataFim }, codProj));
  } catch (err) {
    next(err);
  }
});

const financeiroExportQuery = z.object({
  tipo: z.enum(["dre-comparativo", "contas-receber", "contas-pagar", "movimentos"]),
  empresa: empresaParam,
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  codProj: numberListParam.optional(),
}).refine((q) => q.dataInicio <= q.dataFim, {
  message: "dataInicio deve ser menor ou igual a dataFim.",
});

dashboardRouter.get("/financeiro/exportacao", async (req, res, next) => {
  try {
    const q = financeiroExportQuery.parse(req.query);
    const buffer = await gerarFinanceiroXlsx({
      tipo: q.tipo,
      filtro: q.empresa,
      dataInicio: q.dataInicio,
      dataFim: q.dataFim,
      codProj: q.codProj,
    });
    const nomes: Record<FinanceiroExportTipo, string> = {
      "dre-comparativo": "dre-comparativo",
      "contas-receber": "contas-a-receber",
      "contas-pagar": "contas-a-pagar",
      movimentos: "movimentos-financeiros",
    };
    const filename = `${nomes[q.tipo]}-${q.dataInicio}-${q.dataFim}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/empresa/comodato", (req, res, next) => {
  try {
    const { empresa } = faturamentoQuery.parse(req.query);
    res.json(comodatoConsolidado(empresa));
  } catch (err) {
    next(err);
  }
});

const vendedoresPeriodoQuery = z.object({
  empresa: empresaParam,
  vendedor: vendedorParam,
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  codProj: numberListParam.optional(),
  periodo: z.enum(["dia", "mes", "ano"]).default("ano"),
}).refine((q) => (q.dataInicio === undefined) === (q.dataFim === undefined), {
  message: "Informe dataInicio e dataFim juntos.",
}).refine((q) => !q.dataInicio || !q.dataFim || q.dataInicio <= q.dataFim, {
  message: "dataInicio deve ser menor ou igual a dataFim.",
});

dashboardRouter.get("/vendedores/ranking", (req, res, next) => {
  try {
    const { empresa, vendedor, data, periodo, dataInicio, dataFim, codProj } = vendedoresPeriodoQuery.parse(req.query);
    res.json(vendedoresRanking(data, periodo, empresa, vendedor, { dataInicio, dataFim, codProj }));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/vendedores/hoje", (req, res, next) => {
  try {
    const { empresa, vendedor, data, codProj } = vendedoresPeriodoQuery.parse(req.query);
    res.json(lancamentosHoje(vendedor, data, empresa, { codProj }));
  } catch (err) {
    next(err);
  }
});

const dreQuery = z.object({
  empresa: empresaParam,
  periodo: z.enum(["mes", "ano"]).default("ano"),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  codTipOper: z
    .string()
    .regex(/^\d+(,\d+)*$/)
    .transform((v) => v.split(",").map((n) => Number(n)))
    .optional(),
  codProj: numberListParam.optional(),
}).refine((q) => (q.dataInicio === undefined) === (q.dataFim === undefined), {
  message: "Informe dataInicio e dataFim juntos.",
}).refine((q) => !q.dataInicio || !q.dataFim || q.dataInicio <= q.dataFim, {
  message: "dataInicio deve ser menor ou igual a dataFim.",
});

const financeiroResumoQuery = z.object({
  empresa: empresaParam,
  periodo: z.enum(["mes", "ano"]).default("ano"),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  codTipOper: z
    .string()
    .regex(/^\d+(,\d+)*$/)
    .transform((v) => v.split(",").map((n) => Number(n)))
    .optional(),
  codProj: numberListParam.optional(),
  fluxoMeses: z.coerce.number().int().min(1).max(36).default(12),
}).refine((q) => (q.dataInicio === undefined) === (q.dataFim === undefined), {
  message: "Informe dataInicio e dataFim juntos.",
}).refine((q) => !q.dataInicio || !q.dataFim || q.dataInicio <= q.dataFim, {
  message: "dataInicio deve ser menor ou igual a dataFim.",
});

dashboardRouter.get("/financeiro/dre", (req, res, next) => {
  try {
    const { empresa, periodo, dataInicio, dataFim, codTipOper, codProj } = dreQuery.parse(req.query);
    res.json(dre(empresa, periodo, { dataInicio, dataFim, codTipOper, codProj }));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/financeiro/dre-por-projeto", (req, res, next) => {
  try {
    const { empresa, periodo, dataInicio, dataFim, codProj } = dreQuery.parse(req.query);
    res.json(drePorProjeto(empresa, periodo, { dataInicio, dataFim, codProj }));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/financeiro/resumo", (req, res, next) => {
  try {
    const { empresa, periodo, dataInicio, dataFim, codTipOper, codProj, fluxoMeses } =
      financeiroResumoQuery.parse(req.query);
    res.json(
      financeiroResumo(empresa, periodo, { dataInicio, dataFim, codTipOper, codProj }, fluxoMeses),
    );
  } catch (err) {
    next(err);
  }
});

const fluxoQuery = z.object({
  empresa: empresaParam,
  meses: z.coerce.number().int().min(1).max(36).default(12),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  codProj: numberListParam.optional(),
});

dashboardRouter.get("/financeiro/fluxo-caixa", (req, res, next) => {
  try {
    const { empresa, meses, dataInicio, dataFim, codProj } = fluxoQuery.parse(req.query);
    res.json(fluxoCaixa(empresa, meses, { dataInicio, dataFim, codProj }));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/financeiro/distribuicao-despesas", (req, res, next) => {
  try {
    const { empresa, periodo, dataInicio, dataFim } = dreQuery.parse(req.query);
    res.json(distribuicaoDespesas(empresa, periodo, { dataInicio, dataFim }));
  } catch (err) {
    next(err);
  }
});

const contasQuery = z.object({
  empresa: empresaParam,
  tipo: z.enum(["receber", "pagar"]),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  codProj: numberListParam.optional(),
});

dashboardRouter.get("/financeiro/contas", (req, res, next) => {
  try {
    const q = contasQuery.parse(req.query);
    res.json(listarContasAbertas({
      filtro: q.empresa,
      tipo: q.tipo,
      page: q.page,
      pageSize: q.pageSize,
      dataInicio: q.dataInicio,
      dataFim: q.dataFim,
      codProj: q.codProj,
    }));
  } catch (err) {
    next(err);
  }
});

const estoqueQuery = z.object({
  empresa: empresaParam,
  local: numberListParam.optional(),
});

dashboardRouter.get("/estoque/locais", (req, res, next) => {
  try {
    const { empresa } = estoqueQuery.parse(req.query);
    res.json({ locais: listarLocaisEstoque(empresa) });
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/estoque", (req, res, next) => {
  try {
    const { empresa, local } = estoqueQuery.parse(req.query);
    res.json(estoqueVisaoGeral(empresa, local));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/produtos", (_req, res, next) => {
  try {
    res.json({ produtos: listarProdutos() });
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/projetos", (_req, res, next) => {
  try {
    res.json({ projetos: listarProjetos() });
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/centros-resultado", (_req, res, next) => {
  try {
    res.json({ centros_resultado: listarCentrosResultado() });
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/financeiro/rateio", (req, res, next) => {
  try {
    const q = z.object({
      dataInicio: z.string(),
      dataFim: z.string(),
      codEmp: numberListParam.optional(),
    }).parse(req.query);
    res.json(listarRateio({ dataInicio: q.dataInicio, dataFim: q.dataFim, codEmp: q.codEmp ?? null }));
  } catch (err) {
    next(err);
  }
});

const rateioDiagnosticoQuery = z.object({
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  codEmp: numberListParam.optional(),
  codProj: numberListParam.optional(),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  naoPage: z.coerce.number().int().min(0).default(0),
  naoPageSize: z.coerce.number().int().min(1).max(100).default(20),
}).refine((q) => q.dataInicio <= q.dataFim, {
  message: "dataInicio deve ser menor ou igual a dataFim.",
});

dashboardRouter.get("/financeiro/rateio-diagnostico", (req, res, next) => {
  try {
    const q = rateioDiagnosticoQuery.parse(req.query);
    res.json(rateioDiagnostico(q));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/financeiro/rateio-exportacao", async (req, res, next) => {
  try {
    const q = rateioDiagnosticoQuery.parse(req.query);
    const buffer = await gerarRateioXlsx(q);
    const filename = `diagnostico-rateio-${q.dataInicio}-${q.dataFim}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/clientes", (_req, res, next) => {
  try {
    res.json(clientesBI());
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/rh", (_req, res, next) => {
  try {
    res.json(rhBI());
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/entregas", (_req, res, next) => {
  try {
    res.json(entregasBI());
  } catch (err) {
    next(err);
  }
});

export const empresasRouter = Router();

empresasRouter.get("/", (_req, res, next) => {
  try {
    res.json({ empresas: listarEmpresas() });
  } catch (err) {
    next(err);
  }
});

export const vendedoresRouter = Router();

vendedoresRouter.get("/", (_req, res, next) => {
  try {
    res.json({ vendedores: listarVendedores() });
  } catch (err) {
    next(err);
  }
});
