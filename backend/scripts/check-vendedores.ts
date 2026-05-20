import { loadRecords } from "../src/sankhya/crud.js";

const result = await loadRecords({
  rootEntity: "Vendedor",
  fields: ["CODVEND", "APELIDO", "ATIVO"],
  expression: "this.CODVEND IN (7, 13, 31)",
});

console.log("=== Vendedores 7, 13 e 31 ===");
for (const row of result.rows) {
  console.log(row);
}
