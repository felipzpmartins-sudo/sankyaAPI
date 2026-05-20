import { syncEstoque } from "../src/sync/estoque.js";
import { syncProdutos } from "../src/sync/produtos.js";

async function main(): Promise<void> {
  console.log("Iniciando sync de produtos...");
  await syncProdutos();
  console.log("Sync de produtos concluído.");

  console.log("Iniciando sync de estoque...");
  await syncEstoque();
  console.log("Sync de estoque concluído.");
}

main().catch((err) => {
  console.error("Sync falhou:", err);
  process.exit(1);
});
