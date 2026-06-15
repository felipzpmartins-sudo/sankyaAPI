import { Router } from "express";
import { z } from "zod";
import { listarContasAbertas } from "../services/dashboard-financeiro.js";
import { alunosAtivosViaCerta } from "../services/viacerta.js";
import { empresaParam } from "../utils/empresa.js";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";
import { dashboardRouter, empresasRouter, vendedoresRouter } from "./dashboard.js";
import { createSessionToken, getTotpSetup, isValidTotpCode } from "../auth.js";
import { getSyncState } from "../sync/state.js";

export const router = Router();

function tableCount(table: string): number | null {
  try {
    const row = getDb().prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as
      | { count: number }
      | undefined;
    return row?.count ?? null;
  } catch {
    return null;
  }
}

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    database_path: config.DATABASE_PATH,
    sync: {
      pedidos: getSyncState("pedidos") ?? null,
      titulos: getSyncState("titulos") ?? null,
      estoque: getSyncState("estoque") ?? null,
    },
    rows: {
      pedidos: tableCount("pedidos"),
      titulos: tableCount("titulos"),
      produto_estoque: tableCount("produto_estoque"),
    },
  });
});

router.get("/auth/setup", (_req, res) => {
  res.json(getTotpSetup());
});

router.post("/auth/validate", (req, res) => {
  const body = z.object({ code: z.string().min(6).max(12) }).safeParse(req.body);
  if (!body.success || !isValidTotpCode(body.data.code)) {
    res.status(401).json({ error: "unauthorized", message: "Codigo do autenticador invalido." });
    return;
  }

  res.json({ ok: true, ...createSessionToken() });
});

router.get("/auth/session", (_req, res) => {
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
