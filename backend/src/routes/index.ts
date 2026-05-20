import { Router } from "express";
import { z } from "zod";
import { listarContasAbertas } from "../services/dashboard-financeiro.js";
import { empresaParam } from "../utils/empresa.js";
import { dashboardRouter, empresasRouter, vendedoresRouter } from "./dashboard.js";

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

router.use("/empresas", empresasRouter);
router.use("/vendedores", vendedoresRouter);
router.use("/dashboard", dashboardRouter);

/**
 * /api/receber e /api/pagar mantidos para compatibilidade.
 * Antes liam direto do Sankhya; agora servem do SQLite snapshot
 * (mesmo dado, ordem de magnitude mais rápido). Quem precisa de
 * dado "ao vivo" pode forçar um ciclo de sync via /api/health (futuro).
 */
const titulosQuery = z.object({
  empresa: empresaParam,
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

router.get("/receber", (req, res, next) => {
  try {
    const q = titulosQuery.parse(req.query);
    res.json(
      listarContasAbertas({
        filtro: q.empresa,
        tipo: "receber",
        page: q.page,
        pageSize: q.pageSize,
      }),
    );
  } catch (err) {
    next(err);
  }
});

router.get("/pagar", (req, res, next) => {
  try {
    const q = titulosQuery.parse(req.query);
    res.json(
      listarContasAbertas({
        filtro: q.empresa,
        tipo: "pagar",
        page: q.page,
        pageSize: q.pageSize,
      }),
    );
  } catch (err) {
    next(err);
  }
});
