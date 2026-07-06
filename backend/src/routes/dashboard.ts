import { Router } from "express";
import { z } from "zod";
import {
  distribuicaoDespesas,
  dre,
  financeiroResumo,
  fluxoCaixa,
  listarContasAbertas,
  listarProjetos,
  listarRateio,
} from "../services/dashboard-financeiro.js";
import { clientesBI, rhBI } from "../services/dashboard-clientes-rh.js";
import { entregasBI } from "../services/dashboard-entregas.js";
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
import { estoqueVisaoGeral } from "../services/dashboard-estoque.js";
import { empresaParam } from "../utils/empresa.js";
import { vendedorParam } from "../utils/vendedor.js";

export const dashboardRouter = Router();

const faturamentoQuery = z.object({
  empresa: empresaParam,
  vendedor: vendedorParam,
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const faturamentoPorEmpresaQuery = z.object({
  vendedor: vendedorParam,
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodo: z.enum(["dia", "mes", "ano"]).default("ano"),
});

dashboardRouter.get("/empresa/faturamento", (req, res, next) => {
  try {
    const { empresa, vendedor, data } = faturamentoQuery.parse(req.query);
    res.json(faturamentoConsolidado(empresa, vendedor, data));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/empresa/faturamento-por-empresa", (req, res, next) => {
  try {
    const { vendedor, data, periodo } = faturamentoPorEmpresaQuery.parse(req.query);
    res.json(faturamentoPorEmpresa(vendedor, data, periodo));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/empresa/resumo", (req, res, next) => {
  try {
    const { empresa, vendedor, data } = faturamentoQuery.parse(req.query);
    const { periodo } = faturamentoPorEmpresaQuery.pick({ periodo: true }).parse(req.query);
    res.json(empresasResumo(empresa, vendedor, data, periodo));
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
  vendedor: vendedorParam,
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodo: z.enum(["dia", "mes", "ano"]).default("ano"),
});

dashboardRouter.get("/vendedores/ranking", (req, res, next) => {
  try {
    const { data, periodo } = vendedoresPeriodoQuery.parse(req.query);
    res.json(vendedoresRanking(data, periodo));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/vendedores/hoje", (req, res, next) => {
  try {
    const { vendedor, data } = vendedoresPeriodoQuery.parse(req.query);
    res.json(lancamentosHoje(vendedor, data));
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
  fluxoMeses: z.coerce.number().int().min(1).max(36).default(12),
}).refine((q) => (q.dataInicio === undefined) === (q.dataFim === undefined), {
  message: "Informe dataInicio e dataFim juntos.",
}).refine((q) => !q.dataInicio || !q.dataFim || q.dataInicio <= q.dataFim, {
  message: "dataInicio deve ser menor ou igual a dataFim.",
});

dashboardRouter.get("/financeiro/dre", (req, res, next) => {
  try {
    const { empresa, periodo, dataInicio, dataFim, codTipOper } = dreQuery.parse(req.query);
    res.json(dre(empresa, periodo, { dataInicio, dataFim, codTipOper }));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/financeiro/resumo", (req, res, next) => {
  try {
    const { empresa, periodo, dataInicio, dataFim, codTipOper, fluxoMeses } =
      financeiroResumoQuery.parse(req.query);
    res.json(
      financeiroResumo(empresa, periodo, { dataInicio, dataFim, codTipOper }, fluxoMeses),
    );
  } catch (err) {
    next(err);
  }
});

const fluxoQuery = z.object({
  empresa: empresaParam,
  meses: z.coerce.number().int().min(1).max(36).default(12),
});

dashboardRouter.get("/financeiro/fluxo-caixa", (req, res, next) => {
  try {
    const { empresa, meses } = fluxoQuery.parse(req.query);
    res.json(fluxoCaixa(empresa, meses));
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
});

dashboardRouter.get("/financeiro/contas", (req, res, next) => {
  try {
    const q = contasQuery.parse(req.query);
    res.json(listarContasAbertas({
      filtro: q.empresa,
      tipo: q.tipo,
      page: q.page,
      pageSize: q.pageSize,
    }));
  } catch (err) {
    next(err);
  }
});

const estoqueQuery = z.object({
  empresa: empresaParam,
});

dashboardRouter.get("/estoque", (req, res, next) => {
  try {
    const { empresa } = estoqueQuery.parse(req.query);
    res.json(estoqueVisaoGeral(empresa));
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

dashboardRouter.get("/financeiro/rateio", (req, res, next) => {
  try {
    const q = z.object({ dataInicio: z.string(), dataFim: z.string(), codEmp: z.coerce.number().nullable().optional() }).parse(req.query);
    res.json(listarRateio({ dataInicio: q.dataInicio, dataFim: q.dataFim, codEmp: q.codEmp ?? null }));
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
