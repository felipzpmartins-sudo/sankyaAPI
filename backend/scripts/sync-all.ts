import { syncCentrosResultado } from "../src/sync/centros_resultado.js";
import { syncEmpresas } from "../src/sync/empresas.js";
import { syncEstoque } from "../src/sync/estoque.js";
import { syncNaturezas } from "../src/sync/naturezas.js";
import { syncParceiros } from "../src/sync/parceiros.js";
import { syncPedidos } from "../src/sync/pedidos.js";
import { syncProdutos } from "../src/sync/produtos.js";
import { syncProjetos } from "../src/sync/projetos.js";
import { syncRateio } from "../src/sync/rateio.js";
import { getSyncState } from "../src/sync/state.js";
import { syncTiposOperacao } from "../src/sync/tipos_operacao.js";
import { syncTiposTitulo } from "../src/sync/tipos_titulo.js";
import { syncTitulos } from "../src/sync/titulos.js";
import { syncVendedores } from "../src/sync/vendedores.js";

const jobs: Array<[string, () => Promise<void> | void]> = [
  ["empresas", syncEmpresas],
  ["tipos_operacao", syncTiposOperacao],
  ["naturezas", syncNaturezas],
  ["projetos", syncProjetos],
  ["centros_resultado", syncCentrosResultado],
  ["tipos_titulo", syncTiposTitulo],
  ["parceiros", syncParceiros],
  ["vendedores", syncVendedores],
  ["produtos", syncProdutos],
  ["pedidos", syncPedidos],
  ["titulos", syncTitulos],
  ["estoque", syncEstoque],
  ["rateio", syncRateio],
];

const startedAt = Date.now();
const results: Array<{ entity: string; ok: boolean; rowCount?: number; ms: number; error?: string }> = [];

for (const [entity, sync] of jobs) {
  const jobStartedAt = Date.now();
  console.log(`[sync-all] iniciando ${entity}`);
  try {
    await sync();
    const state = getSyncState(entity);
    results.push({ entity, ok: true, rowCount: state?.row_count, ms: Date.now() - jobStartedAt });
    console.log(`[sync-all] concluído ${entity}: ${state?.row_count ?? 0} linhas`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ entity, ok: false, ms: Date.now() - jobStartedAt, error: message });
    console.error(`[sync-all] falhou ${entity}: ${message}`);
  }
}

console.log(JSON.stringify({ totalMs: Date.now() - startedAt, results }, null, 2));
if (results.some((result) => !result.ok)) process.exitCode = 1;
