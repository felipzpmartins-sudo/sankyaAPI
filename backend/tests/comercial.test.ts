import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "comercial-")), "teste.db");
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
const S = await import("../src/services/comercial.js");
const { isRetryableError } = await import("../src/sankhya/client.js");

migrate();
const db = getDb();
const AGORA = "2026-03-10T00:00:00.000Z";
const filtros = {
  empresa: { modo: "todas" } as const,
  vendedor: { modo: "todos" } as const,
  periodo: { dataInicio: "2026-03-01", dataFim: "2026-03-31" },
};

const pedido = db.prepare(
  `INSERT INTO pedidos (NUNOTA, CODEMP, CODPARC, CODVEND, CODTIPOPER, TIPMOV, STATUSNOTA, PENDENTE,
                        DTNEG, DTFATUR, VLRNOTA, synced_at)
   VALUES (@NUNOTA, 1, 10, 5, @TOP, @TIPMOV, 'L', @PENDENTE, '2026-03-05', @DTFATUR, @VLRNOTA, '${AGORA}')`,
);
const item = db.prepare(
  `INSERT INTO pedido_itens (NUNOTA, SEQUENCIA, CODPROD, QTDNEG, VLRUNIT, VLRTOT, VLRDESC, USOPROD, synced_at)
   VALUES (@NUNOTA, @SEQ, @CODPROD, @QTD, @UNIT, @TOT, @DESC, @USO, '${AGORA}')`,
);
const vinculo = db.prepare(`INSERT INTO pedido_nota (NUNOTA_PEDIDO, NUNOTA_NOTA, synced_at) VALUES (?, ?, '${AGORA}')`);

db.prepare(`INSERT INTO empresas (CODEMP, NOMEFANTASIA, ordem, synced_at) VALUES (1, 'MAKER', 1, ?)`).run(AGORA);
for (const [cod, nome] of [[100, "CONJUNTO"], [101, "COMPONENTE A"], [102, "COMPONENTE B"], [200, "AVULSO"], [300, "PARADO"]] as const) {
  db.prepare(`INSERT INTO produtos (CODPROD, DESCRPROD, ativo, synced_at) VALUES (?, ?, 1, ?)`).run(cod, nome, AGORA);
}

// Pedidos: 1 faturado, 1 pendente sem nota, 1 parcial, 1 orçamento (fora).
pedido.run({ NUNOTA: 1, TOP: 1000, TIPMOV: "P", PENDENTE: "N", DTFATUR: null, VLRNOTA: 1000 });
pedido.run({ NUNOTA: 2, TOP: 1000, TIPMOV: "P", PENDENTE: "S", DTFATUR: null, VLRNOTA: 300 });
pedido.run({ NUNOTA: 3, TOP: 1000, TIPMOV: "P", PENDENTE: "S", DTFATUR: null, VLRNOTA: 500 });
pedido.run({ NUNOTA: 4, TOP: 900, TIPMOV: "P", PENDENTE: "S", DTFATUR: null, VLRNOTA: 99_999 });

// Nota de kit: conjunto 1000 + componentes 600 + 400 (USOPROD D), e um item
// avulso de 250 com 50 de desconto. VLRNOTA = 1000 + 200 = 1200.
pedido.run({ NUNOTA: 10, TOP: 1100, TIPMOV: "V", PENDENTE: "N", DTFATUR: "2026-03-06", VLRNOTA: 1200 });
item.run({ NUNOTA: 10, SEQ: 1, CODPROD: 101, QTD: 2, UNIT: 300, TOT: 600, DESC: 0, USO: "D" });
item.run({ NUNOTA: 10, SEQ: 2, CODPROD: 102, QTD: 2, UNIT: 200, TOT: 400, DESC: 0, USO: "D" });
item.run({ NUNOTA: 10, SEQ: 3, CODPROD: 100, QTD: 2, UNIT: 500, TOT: 1000, DESC: 0, USO: "R" });
item.run({ NUNOTA: 10, SEQ: 4, CODPROD: 200, QTD: 1, UNIT: 250, TOT: 250, DESC: 50, USO: "R" });
pedido.run({ NUNOTA: 11, TOP: 1100, TIPMOV: "V", PENDENTE: "N", DTFATUR: "2026-03-07", VLRNOTA: 200 });
vinculo.run(1, 10);
vinculo.run(3, 11);

// Estoque: proprio 5, com parceiro 7, de terceiro 9. So o proprio conta.
const est = db.prepare(
  `INSERT INTO produto_estoque (CODEMP, CODPROD, CODLOCALORIG, CONTROLE, CODPARC, TIPO, ESTOQUE, synced_at)
   VALUES (1, 300, 1, '', ?, ?, ?, '${AGORA}')`,
);
est.run(0, "P", 5);
est.run(77, "P", 7);
est.run(77, "T", 9);

test("pedidos: orcamento e outras TOPs que nao sao venda ficam de fora", () => {
  const r = S.pedidosVsNota(filtros);
  assert.equal(r.total_pedidos, 3);
  assert.equal(r.valor_total, 1800);
});

test("pedidos: pendente segue o PENDENTE do Sankhya e separa o parcial", () => {
  const r = S.pedidosVsNota(filtros);
  assert.equal(r.com_nota, 2);
  assert.equal(r.pendentes, 2);
  assert.equal(r.sem_nota, 1);
  assert.equal(r.parciais, 1);
  assert.equal(r.valor_pendente, 800);
  assert.equal(r.valor_sem_nota, 300);
  assert.deepEqual(r.pedidos.map((p) => [p.NUNOTA, p.parcial]), [[2, false], [3, true]]);
});

test("lista de pedidos bate com cada cartao da tela comercial", () => {
  const resumo = S.pedidosVsNota(filtros);
  const todos = S.listarPedidos({ ...filtros, situacao: "todos" });
  const comNota = S.listarPedidos({ ...filtros, situacao: "com_nota" });
  const pendentes = S.listarPedidos({ ...filtros, situacao: "pendentes" });

  assert.equal(todos.total, resumo.total_pedidos);
  assert.equal(todos.valor_total, resumo.valor_total);
  assert.equal(comNota.total, resumo.com_nota);
  assert.equal(pendentes.total, resumo.pendentes);
  assert.equal(pendentes.valor_total, resumo.valor_pendente);
  assert.deepEqual(
    todos.pedidos.map((p) => [p.NUNOTA, p.situacao]).sort(),
    [[1, "faturado"], [2, "sem_nota"], [3, "parcial"]],
  );
  assert.deepEqual(comNota.pedidos.map((p) => p.NUNOTA).sort(), [1, 3]);
});

test("ranking de vendedores usa o mesmo corte de pedido de venda", () => {
  const r = S.rankingVendedores(filtros);
  assert.equal(r.total, 1800);
  assert.equal(r.vendedores[0].pedidos, 3);
});

test("produtos: kit conta uma vez e o desconto do item sai do valor", () => {
  const r = S.curvaAbc(filtros);
  // 1000 do conjunto + (250 - 50) do avulso. Os componentes nao somam.
  assert.equal(r.total, 1200);
  assert.deepEqual(r.produtos.map((p) => [p.CODPROD, p.valor, p.qtd]), [[100, 1000, 2], [200, 200, 1]]);
});

test("quem vende o que soma o mesmo valor da curva", () => {
  assert.equal(S.vendedoresPorProduto(filtros).total, 1200);
  assert.equal(S.vendedoresPorProduto({ ...filtros, codProd: 101 }).total, 0);
});

test("sem venda: componente vendido dentro do kit nao aparece como parado", () => {
  const r = S.produtosSemVenda(filtros);
  assert.deepEqual(r.produtos.map((p) => p.CODPROD), [300]);
});

test("sem venda: estoque em maos e so o proprio", () => {
  const r = S.produtosSemVenda(filtros);
  assert.equal(r.produtos[0].estoque, 5);
  assert.equal(r.com_estoque, 1);
});

test("retry cobre o 400 intermitente do /authenticate e erros 5xx", () => {
  assert.equal(isRetryableError(new Error('Falha na autenticação Sankhya (400): {"error":"x"}')), true);
  assert.equal(isRetryableError(new Error("Sankhya 503: {}")), true);
  assert.equal(isRetryableError(new Error("Sankhya 429: {}")), true);
  assert.equal(isRetryableError(new Error("Sankhya 404: {}")), false);
});
