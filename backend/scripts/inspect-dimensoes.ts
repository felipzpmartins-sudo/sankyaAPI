import Database from "better-sqlite3";

const db = new Database("data/snapshot.db", { readonly: true });

console.log("=== sync_state ===");
console.table(db.prepare("SELECT entity, last_synced_at, success_count, error_count, row_count FROM sync_state ORDER BY entity").all());

console.log("\n=== contagens das dimensoes novas ===");
console.table([
  db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM naturezas)    AS naturezas,
         (SELECT COUNT(*) FROM tipos_titulo) AS tipos_titulo`,
    )
    .get(),
]);

console.log("\n=== amostra naturezas (primeiros 10 ordenados por CODNAT) ===");
console.table(
  db.prepare("SELECT CODNAT, DESCRNAT FROM naturezas ORDER BY CODNAT LIMIT 10").all(),
);

console.log("\n=== amostra tipos_titulo (top 10 mais comuns) ===");
console.table(
  db
    .prepare("SELECT CODTIPTIT, DESCRTIPTIT FROM tipos_titulo ORDER BY CODTIPTIT LIMIT 10")
    .all(),
);

console.log("\n=== distribuicao de CODNATs por prefixo (1 dig.) ===");
console.table(
  db
    .prepare(
      `SELECT
         SUBSTR(CAST(CODNAT AS TEXT), 1, 1) AS prefixo,
         COUNT(*) AS qt,
         GROUP_CONCAT(DESCRNAT, ' | ') AS exemplos
       FROM naturezas
       GROUP BY prefixo
       ORDER BY prefixo`,
    )
    .all()
    .map((r: any) => ({
      prefixo: r.prefixo,
      qt: r.qt,
      exemplos: r.exemplos.slice(0, 100) + (r.exemplos.length > 100 ? "..." : ""),
    })),
);

db.close();
