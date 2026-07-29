import { Router } from "express";
import { z } from "zod";
import { listarCentrosResultado, listarContasAbertas, listarProjetos } from "../services/dashboard-financeiro.js";
import { alunosAtivosViaCerta } from "../services/viacerta.js";
import { gerarViaCertaXlsx } from "../services/viacerta-export.js";
import { empresaParam } from "../utils/empresa.js";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";
import { dashboardRouter, empresasRouter, vendedoresRouter } from "./dashboard.js";
import {
  createSessionToken,
  authenticateLogin,
  getRequestUser,
  getTotpSetup,
  isValidTotpCode,
} from "../auth.js";
import { getSyncState } from "../sync/state.js";
import { FATURAMENTO_TOPS, inListClause } from "../services/operacoes.js";

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

function latestValue(table: string, column: string): string | null {
  try {
    const row = getDb().prepare(`SELECT MAX(${column}) AS value FROM ${table}`).get() as
      | { value: string | null }
      | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function latestFaturamentoDate(): string | null {
  try {
    const row = getDb()
      .prepare(`SELECT MAX(DTFATUR) AS value FROM pedidos
        WHERE ${inListClause("CODTIPOPER", FATURAMENTO_TOPS)}
          AND STATUSNOTA = 'L' AND DTFATUR IS NOT NULL`)
      .get() as { value: string | null } | undefined;
    return row?.value ?? null;
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
      centros_resultado: getSyncState("centros_resultado") ?? null,
      projetos: getSyncState("projetos") ?? null,
      rateio: getSyncState("rateio") ?? null,
      estoque: getSyncState("estoque") ?? null,
    },
    rows: {
      pedidos: tableCount("pedidos"),
      titulos: tableCount("titulos"),
      centros_resultado: tableCount("centros_resultado"),
      projetos: tableCount("projetos"),
      titulos_rateio: tableCount("titulos_rateio"),
      produto_estoque: tableCount("produto_estoque"),
    },
    data_available: {
      pedidos_ate: latestFaturamentoDate(),
      titulos_ate: latestValue("titulos", "DTNEG"),
      estoque_ate: latestValue("produto_estoque", "synced_at"),
    },
  });
});

router.get("/auth/setup", (_req, res) => {
  res.json(getTotpSetup());
});

router.post("/auth/login", (req, res) => {
  const body = z
    .object({
      email: z.string().email(),
      password: z.string().min(8).max(200),
    })
    .safeParse(req.body);

  const user = body.success ? authenticateLogin(body.data.email, body.data.password) : null;
  if (!user) {
    res.status(401).json({
      error: "unauthorized",
      message: "E-mail ou senha incorretos.",
    });
    return;
  }

  res.json({
    ok: true,
    user,
    ...createSessionToken(user),
  });
});

router.post("/auth/validate", (req, res) => {
  const body = z.object({ code: z.string().min(6).max(12) }).safeParse(req.body);
  if (!body.success || !isValidTotpCode(body.data.code)) {
    res.status(401).json({ error: "unauthorized", message: "Codigo do autenticador invalido." });
    return;
  }

  res.json({ ok: true, ...createSessionToken({ email: config.APP_LOGIN_EMAIL, role: "executive" }) });
});

router.get("/auth/session", (req, res) => {
  const user = getRequestUser(req);
  if (!user) {
    res.status(401).json({ error: "unauthorized", message: "Sessao invalida ou expirada." });
    return;
  }
  res.json({ ok: true, user });
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
    if (getRequestUser(req)?.role !== "viacerta") {
      res.status(403).json({ error: "forbidden", message: "Este painel e exclusivo para o acesso Via Certa." });
      return;
    }
    const q = viaCertaAlunosAtivosQuery.parse(req.query);
    res.json(await alunosAtivosViaCerta(q));
  } catch (err) {
    next(err);
  }
});

router.get("/viacerta/alunos-ativos/exportacao", async (req, res, next) => {
  try {
    if (getRequestUser(req)?.role !== "viacerta") {
      res.status(403).json({ error: "forbidden", message: "Este painel e exclusivo para o acesso Via Certa." });
      return;
    }
    const q = viaCertaAlunosAtivosQuery.parse(req.query);
    const buffer = await gerarViaCertaXlsx(await alunosAtivosViaCerta(q));
    const filename = `alunos-via-certa-${q.year}-${q.month}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
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

router.get("/projetos", (_req, res, next) => {
  try {
    res.json({ projetos: listarProjetos() });
  } catch (err) {
    next(err);
  }
});

router.get("/centros-resultado", (_req, res, next) => {
  try {
    res.json({ centros_resultado: listarCentrosResultado() });
  } catch (err) {
    next(err);
  }
});
