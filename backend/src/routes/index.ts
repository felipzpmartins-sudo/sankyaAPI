import { Router } from "express";
import { z } from "zod";
import { listarContasAbertas } from "../services/dashboard-financeiro.js";
import { alunosAtivosViaCerta } from "../services/viacerta.js";
import { empresaParam } from "../utils/empresa.js";
import { dashboardRouter, empresasRouter, vendedoresRouter } from "./dashboard.js";
import { isValidAccessToken } from "../auth.js";

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

router.post("/auth/validate", (req, res) => {
  const token = z.object({ token: z.string().min(1) }).safeParse(req.body);
  if (!token.success || !isValidAccessToken(token.data.token)) {
    res.status(401).json({ error: "unauthorized", message: "Token de acesso invalido." });
    return;
  }

  res.json({ ok: true });
});

router.use("/empresas", empresasRouter);
router.use("/vendedores", vendedoresRouter);
router.use("/dashboard", dashboardRouter);

const viaCertaAlunosAtivosQuery = z.object({
  month: z.string().regex(/^(0[1-9]|1[0-2])$/),
  year: z.string().regex(/^\d{4}$/),
});

router.get("/viacerta/alunos-ativos", async (req, res, next) => {
  try {
    const q = viaCertaAlunosAtivosQuery.parse(req.query);
    res.json(await alunosAtivosViaCerta(q));
  } catch (err) {
    next(err);
  }
});

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
