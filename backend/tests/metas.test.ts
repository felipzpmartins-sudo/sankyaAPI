import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "metas-")), "teste.db");
process.env.SANKHYA_BASE_URL ??= "https://exemplo.invalido";
process.env.SANKHYA_TOKEN ??= "token-de-teste";
process.env.SANKHYA_CLIENT_ID ??= "cliente";
process.env.SANKHYA_CLIENT_SECRET ??= "segredo";
process.env.APP_TOTP_SECRET ??= "JBSWY3DPEHPK3PXP";
process.env.APP_SESSION_SECRET ??= "segredo-de-sessao-para-teste-123456";
process.env.APP_LOGIN_EMAIL ??= "dono@exemplo.com";
process.env.APP_LOGIN_PASSWORD ??= "senha-do-dono-1234";
delete process.env.METAS_EDITORES;

const { migrate } = await import("../src/db/migrate.js");
const { getDb } = await import("../src/db/connection.js");
const S = await import("../src/services/comercial.js");
const M = await import("../src/services/metas.js");

migrate();
const db = getDb();
const AGORA = "2026-03-10T00:00:00.000Z";
const todos = { empresa: { modo: "todas" } as const, vendedor: { modo: "todos" } as const };

db.prepare(`INSERT INTO empresas (CODEMP, NOMEFANTASIA, ordem, synced_at) VALUES (1, 'MAKER', 1, ?)`).run(AGORA);
for (const [cod, nome, ativo] of [[5, "ANA", 1], [6, "BRUNO", 1], [7, "CARLA", 1], [8, "ANTIGO", 0]] as const) {
  db.prepare(`INSERT INTO vendedores (CODVEND, APELIDO, ativo, synced_at) VALUES (?, ?, ?, ?)`).run(cod, nome, ativo, AGORA);
}

const pedido = db.prepare(
  `INSERT INTO pedidos (NUNOTA, CODEMP, CODPARC, CODVEND, CODTIPOPER, TIPMOV, STATUSNOTA, PENDENTE,
                        DTNEG, VLRNOTA, synced_at)
   VALUES (@NUNOTA, 1, 10, @CODVEND, @TOP, 'P', @STATUS, 'N', @DTNEG, @VLRNOTA, '${AGORA}')`,
);
// ANA: quinta 05/03 e sexta 20/03. CARLA: sexta 27/02. Cancelado e orcamento ficam de fora.
pedido.run({ NUNOTA: 1, CODVEND: 5, TOP: 1000, STATUS: "L", DTNEG: "2026-03-05", VLRNOTA: 1000 });
pedido.run({ NUNOTA: 2, CODVEND: 5, TOP: 1000, STATUS: "L", DTNEG: "2026-03-20", VLRNOTA: 500 });
pedido.run({ NUNOTA: 3, CODVEND: 7, TOP: 1000, STATUS: "L", DTNEG: "2026-02-27", VLRNOTA: 200 });
pedido.run({ NUNOTA: 4, CODVEND: 5, TOP: 1000, STATUS: "C", DTNEG: "2026-03-06", VLRNOTA: 9_999 });
pedido.run({ NUNOTA: 5, CODVEND: 5, TOP: 900, STATUS: "L", DTNEG: "2026-03-06", VLRNOTA: 9_999 });

test("metas: grava, sobrescreve e apaga com valor vazio", () => {
  M.gravarMetas("2026-03", [{ CODVEND: 5, valor: 3000 }, { CODVEND: 6, valor: 1000 }], "rafael@exemplo.com");
  M.gravarMetas("2026-03", [{ CODVEND: 5, valor: 3100 }, { CODVEND: 6, valor: null }], "rafael@exemplo.com");

  const r = M.listarMetas("2026-03");
  const ana = r.vendedores.find((v) => v.CODVEND === 5);
  assert.equal(ana?.valor, 3100);
  assert.equal(ana?.alterado_por, "rafael@exemplo.com");
  assert.equal(r.vendedores.find((v) => v.CODVEND === 6)?.valor, null);
  // Inativo sem meta nao entra no formulario.
  assert.equal(r.vendedores.some((v) => v.CODVEND === 8), false);
  // Quem tem meta vem primeiro.
  assert.equal(r.vendedores[0].CODVEND, 5);
});

test("metas: sem METAS_EDITORES qualquer conta logada edita", () => {
  assert.equal(M.podeEditarMetas("qualquer@exemplo.com"), true);
  assert.equal(M.podeEditarMetas(null), false);
});

test("vendas por mes: colunas do periodo, meta cheia do mes e total igual ao ranking", () => {
  M.gravarMetas("2026-03", [{ CODVEND: 5, valor: 3000 }], null);
  M.gravarMetas("2026-02", [{ CODVEND: 6, valor: 800 }], null);
  const periodo = { dataInicio: "2026-02-15", dataFim: "2026-03-31" };
  const r = S.vendasPorPeriodo({ ...todos, periodo, agrupamento: "mes" });

  assert.deepEqual(r.colunas.map((c) => [c.chave, c.inicio, c.fim]), [
    ["2026-02", "2026-02-15", "2026-02-28"],
    ["2026-03", "2026-03-01", "2026-03-31"],
  ]);

  const ana = r.vendedores.find((v) => v.CODVEND === 5)!;
  assert.deepEqual(ana.celulas[1], { pedidos: 2, valor: 1500, meta: 3000, atingido_pct: 50 });
  assert.equal(ana.celulas[0].meta, null);
  assert.deepEqual(ana.total, { pedidos: 2, valor: 1500, meta: 3000, atingido_pct: 50 });

  // BRUNO nao vendeu nada mas tem meta: aparece zerado.
  const bruno = r.vendedores.find((v) => v.CODVEND === 6)!;
  assert.deepEqual(bruno.celulas[0], { pedidos: 0, valor: 0, meta: 800, atingido_pct: 0 });

  assert.equal(r.totais.total.valor, S.rankingVendedores({ ...todos, periodo }).total);
  assert.equal(r.totais.total.meta, 3800);
  assert.deepEqual(r.vendedores.map((v) => v.CODVEND), [5, 7, 6]);
});

test("vendas por semana: semana comeca na segunda e meta e proporcional aos dias", () => {
  const periodo = { dataInicio: "2026-03-01", dataFim: "2026-03-31" };
  const r = S.vendasPorPeriodo({ ...todos, periodo, agrupamento: "semana" });

  // 01/03/2026 e domingo: a primeira coluna e a semana de 23/02, cortada em 01/03.
  assert.deepEqual(r.colunas[0], { chave: "2026-02-23", inicio: "2026-03-01", fim: "2026-03-01" });
  assert.equal(r.colunas.at(-1)?.chave, "2026-03-30");
  assert.equal(r.colunas.at(-1)?.fim, "2026-03-31");

  const ana = r.vendedores.find((v) => v.CODVEND === 5)!;
  const semana02 = r.colunas.findIndex((c) => c.chave === "2026-03-02");
  assert.equal(ana.celulas[semana02].valor, 1000);
  assert.equal(ana.celulas[semana02].meta, Math.round((3000 / 31) * 7 * 100) / 100);
  // Somando as semanas, a meta do mes inteiro volta.
  assert.equal(ana.total.meta, 3000);
});

test("vendas por periodo: filtro de vendedor vale para quem so tem meta", () => {
  const periodo = { dataInicio: "2026-02-01", dataFim: "2026-03-31" };
  const r = S.vendasPorPeriodo({
    ...todos,
    vendedor: { modo: "lista", ids: [5] },
    periodo,
    agrupamento: "mes",
  });
  assert.deepEqual(r.vendedores.map((v) => v.CODVEND), [5]);
});
