/**
 * Roda os syncs novos contra o Sankhya de verdade num banco temporario e
 * confere os numeros com o que o ERP respondeu. Uso manual, nao entra no CI.
 *
 *   ENVPATH=/caminho/do/.env npx tsx scripts/valida-comercial.ts
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bancoTemporario = join(mkdtempSync(join(tmpdir(), "comercial-")), "teste.db");

// Credenciais vem do .env real do projeto, informado em ENVPATH. Nada e
// impresso: o script so precisa delas para falar com o Sankhya.
if (process.env.ENVPATH) {
  const conteudo = readFileSync(process.env.ENVPATH, "utf8");
  for (const bruta of conteudo.split("\n")) {
    const linha = bruta.trim();
    if (!linha || linha.startsWith("#") || !linha.includes("=")) continue;
    const corte = linha.indexOf("=");
    process.env[linha.slice(0, corte).trim()] = linha.slice(corte + 1).trim();
  }
}
// Depois de carregar o .env, senao o DATABASE_PATH de la vence.
process.env.DATABASE_PATH = bancoTemporario;
process.env.APP_LOGIN_EMAIL ??= "validacao@local.test";
process.env.APP_LOGIN_PASSWORD ??= "somente-para-validar-1234";
process.env.SYNC_ENABLED = "false";

const { migrate } = await import("../src/db/migrate.js");
const { syncEmpresas } = await import("../src/sync/empresas.js");
const { syncTiposOperacao } = await import("../src/sync/tipos_operacao.js");
const { syncVendedores } = await import("../src/sync/vendedores.js");
const { syncParceiros } = await import("../src/sync/parceiros.js");
const { syncProdutos } = await import("../src/sync/produtos.js");
const { syncPedidos } = await import("../src/sync/pedidos.js");
const { syncVinculos } = await import("../src/sync/vinculos.js");
const { syncItens } = await import("../src/sync/itens.js");
const { syncEstoque } = await import("../src/sync/estoque.js");
const { pedidosVsNota, curvaAbc, rankingProdutos, rankingVendedores, produtosSemVenda } =
  await import("../src/services/comercial.js");

migrate();
console.log("banco:", process.env.DATABASE_PATH);

const passos = [
  ["empresas", syncEmpresas],
  ["tipos_operacao", syncTiposOperacao],
  ["vendedores", syncVendedores],
  ["parceiros", syncParceiros],
  ["produtos", syncProdutos],
  ["pedidos", syncPedidos],
  ["vinculos", syncVinculos],
  ["itens", syncItens],
  ["estoque", syncEstoque],
] as const;

for (const [nome, fn] of passos) {
  const t0 = Date.now();
  await fn();
  console.log(`  sync ${nome.padEnd(11)} ok em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const periodo = { dataInicio: "2026-01-01", dataFim: "2026-12-31" };
const filtros = {
  empresa: { modo: "todas" } as const,
  vendedor: { modo: "todos" } as const,
  periodo,
};

const pvn = pedidosVsNota(filtros);
console.log("\n=== pedidos x nota (2026) ===");
console.log("  total pedidos :", pvn.total_pedidos, " | ERP disse 1521");
console.log("  com nota      :", pvn.com_nota, " | ERP disse 1438");
console.log("  sem nota      :", pvn.sem_nota, " | ERP disse 83");
console.log("  R$ sem nota   :", pvn.valor_sem_nota.toFixed(2), " | ERP disse 788818.11");

const abc = curvaAbc(filtros);
console.log("\n=== curva ABC (2026) ===");
console.log(`  faturamento por item: R$ ${abc.total.toFixed(2)} em ${abc.produtos.length} produtos`);
for (const r of abc.resumo) {
  console.log(
    `  curva ${r.curva}: ${String(r.produtos).padStart(4)} produtos` +
      ` · R$ ${r.valor.toFixed(2)} · ${r.participacao_pct}%`,
  );
}

const rk = rankingProdutos(filtros);
console.log("\n=== top 5 mais vendidos ===");
for (const r of rk.mais_vendidos.slice(0, 5)) {
  console.log(`  ${String(r.produto).slice(0, 44).padEnd(46)} R$ ${r.valor.toFixed(2)}`);
}

const rv = rankingVendedores(filtros);
console.log("\n=== top 5 vendedores por pedido ===");
for (const r of rv.vendedores.slice(0, 5)) {
  console.log(
    `  ${r.vendedor.padEnd(22)} ${String(r.pedidos).padStart(4)} pedidos` +
      ` · R$ ${r.valor.toFixed(2)} · ${r.participacao_pct}%`,
  );
}

const sv = produtosSemVenda(filtros);
console.log("");
console.log("=== produtos ativos sem venda (2026) ===");
console.log("  total de ativos    :", sv.total_ativos, " | ERP disse 3082");
console.log("  sem venda          :", sv.sem_venda, " | ERP disse 2516");
console.log("  pararam de vender  :", sv.pararam_de_vender, " | ERP disse 184");
console.log("  nunca na janela    :", sv.nunca_na_janela, " | ERP disse 2332");
console.log("  com estoque > 0    :", sv.com_estoque);
console.log("  historico comeca em:", sv.inicio_do_historico);
console.log("");
console.log("  os 5 primeiros que pararam de vender:");
for (const r of sv.produtos.filter((x) => x.parou_de_vender).slice(0, 5)) {
  console.log(
    `    ${String(r.produto).slice(0, 38).padEnd(40)}` +
    ` ult. venda ${r.ultima_venda} · ${r.dias_sem_vender}d · estoque ${r.estoque}`,
  );
}
