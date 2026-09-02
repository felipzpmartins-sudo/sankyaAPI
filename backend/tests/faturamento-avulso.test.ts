import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// O modulo de config valida o ambiente na importacao, e a conexao abre o banco
// no caminho de DATABASE_PATH. Ambos precisam estar prontos antes do import.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "avulso-")), "teste.db");
process.env.SANKHYA_BASE_URL ??= "https://exemplo.invalido";
process.env.SANKHYA_TOKEN ??= "token-de-teste";
process.env.SANKHYA_CLIENT_ID ??= "cliente";
process.env.SANKHYA_CLIENT_SECRET ??= "segredo";
process.env.APP_TOTP_SECRET ??= "JBSWY3DPEHPK3PXP";
process.env.APP_SESSION_SECRET ??= "segredo-de-sessao-para-teste-123456";
process.env.APP_LOGIN_EMAIL ??= "dono@exemplo.com";
process.env.APP_LOGIN_PASSWORD ??= "senha-do-dono-1234";

const { migrate } = await import("../src/db/migrate.js");
const { getDb } = await import("../src/db/connection.js");
const { faturamentoConsolidado } = await import("../src/services/dashboard.js");
const { dre } = await import("../src/services/dashboard-financeiro.js");

migrate();

const AGORA = "2026-03-10T00:00:00.000Z";
const REF = "2026-03-15";
const VALOR_NOTA = 10_000;
const VALOR_AVULSO = 7_494.7;

const db = getDb();

db.prepare(
  `INSERT INTO empresas (CODEMP, NOMEFANTASIA, ordem, synced_at) VALUES (1, 'MAKER', 1, ?)`,
).run(AGORA);

/** Nota fiscal normal: TOP de faturamento, liberada e faturada em marco. */
db.prepare(
  `INSERT INTO pedidos
     (NUNOTA, CODEMP, CODPARC, CODTIPOPER, TIPMOV, STATUSNOTA, DTNEG, DTFATUR, VLRNOTA, CODPROJ, synced_at)
   VALUES (1, 1, 10, 1100, 'V', 'L', '2026-03-05', '2026-03-05', ?, 0, ?)`,
).run(VALOR_NOTA, AGORA);

/** Lancamento financeiro avulso: TOP 1811, receita, sem nota. */
db.prepare(
  `INSERT INTO titulos
     (NUFIN, CODEMP, CODPARC, CODTIPOPER, CODNAT, RECDESP, PROVISAO, tipo,
      DTNEG, DTVENC, VLRDESDOB, valor_aberto, is_em_aberto, CODPROJ, synced_at)
   VALUES (100, 1, 10, 1811, 1020500, 1, 'N', 'receber',
      '2026-03-08', '2026-03-08', ?, ?, 1, 0, ?)`,
).run(VALOR_AVULSO, VALOR_AVULSO, AGORA);

/** Lancamento avulso de DESPESA: mesma TOP, mas RECDESP = -1. Nao e receita. */
db.prepare(
  `INSERT INTO titulos
     (NUFIN, CODEMP, CODPARC, CODTIPOPER, CODNAT, RECDESP, PROVISAO, tipo,
      DTNEG, DTVENC, VLRDESDOB, valor_aberto, is_em_aberto, CODPROJ, synced_at)
   VALUES (101, 1, 10, 1811, 2020500, -1, 'N', 'pagar',
      '2026-03-08', '2026-03-08', 999, 999, 1, 0, ?)`,
).run(AGORA);

/** Lancamento avulso ainda em PROVISAO: previsao nao e faturamento. */
db.prepare(
  `INSERT INTO titulos
     (NUFIN, CODEMP, CODPARC, CODTIPOPER, CODNAT, RECDESP, PROVISAO, tipo,
      DTNEG, DTVENC, VLRDESDOB, valor_aberto, is_em_aberto, CODPROJ, synced_at)
   VALUES (102, 1, 10, 1811, 1020500, 1, 'S', 'receber',
      '2026-03-08', '2026-03-08', 555, 555, 1, 0, ?)`,
).run(AGORA);

/** TOP 1300 (LANCAMENTO FINANCEIRO comum): fora da whitelist, nao entra. */
db.prepare(
  `INSERT INTO titulos
     (NUFIN, CODEMP, CODPARC, CODTIPOPER, CODNAT, RECDESP, PROVISAO, tipo,
      DTNEG, DTVENC, VLRDESDOB, valor_aberto, is_em_aberto, CODPROJ, synced_at)
   VALUES (103, 1, 10, 1300, 1020500, 1, 'N', 'receber',
      '2026-03-08', '2026-03-08', 1000000, 1000000, 1, 0, ?)`,
).run(AGORA);

test("faturamento do mes soma a nota e o lancamento avulso", () => {
  const r = faturamentoConsolidado({ modo: "todas" }, { modo: "todos" }, REF);
  assert.equal(r.mes_atual, VALOR_NOTA + VALOR_AVULSO);
  assert.equal(r.faturamento_bruto, VALOR_NOTA + VALOR_AVULSO);
});

test("contagem de notas e ticket medio ignoram o avulso", () => {
  const r = faturamentoConsolidado({ modo: "todas" }, { modo: "todos" }, REF);
  assert.equal(r.qtd_notas, 1, "lancamento avulso nao e nota");
  assert.equal(r.ticket_medio, VALOR_NOTA, "ticket medio e valor de nota por nota");
});

test("despesa, provisao e TOP fora da lista nao entram no faturamento", () => {
  const r = faturamentoConsolidado({ modo: "todas" }, { modo: "todos" }, REF);
  // Se algum deles vazasse, o total saltaria (999, 555 ou 1.000.000).
  assert.equal(r.mes_atual, VALOR_NOTA + VALOR_AVULSO);
});

test("filtro de vendedor deixa o avulso de fora, porque ele nao tem vendedor", () => {
  const r = faturamentoConsolidado({ modo: "todas" }, { modo: "lista", ids: [7] }, REF);
  assert.equal(r.mes_atual, 0);
});

test("evolucao mensal tambem soma as duas origens", () => {
  const r = faturamentoConsolidado({ modo: "todas" }, { modo: "todos" }, REF);
  const marco = r.evolucao.find((item) => item.mes === "Mar");
  assert.equal(marco?.atual, VALOR_NOTA + VALOR_AVULSO);
});

test("receita do DRE consolidado inclui o avulso", () => {
  const r = dre({ modo: "todas" }, "mes", { dataInicio: "2026-03-01", dataFim: "2026-03-31" });
  assert.equal(r.receita_bruta, VALOR_NOTA + VALOR_AVULSO);
});
