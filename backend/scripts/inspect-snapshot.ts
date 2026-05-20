import Database from "better-sqlite3";

const db = new Database("data/snapshot.db", { readonly: true });

console.log("=== sync_state ===");
console.table(db.prepare("SELECT * FROM sync_state").all());

console.log("\n=== contagens ===");
const counts = db
  .prepare(
    `SELECT
       (SELECT COUNT(*) FROM empresas)        AS empresas,
       (SELECT COUNT(*) FROM tipos_operacao)  AS tipos_operacao,
       (SELECT COUNT(*) FROM pedidos)         AS pedidos`,
  )
  .get();
console.table([counts]);

console.log("\n=== empresas (top 12 por ordem) ===");
console.table(
  db
    .prepare("SELECT CODEMP, NOMEFANTASIA, ordem FROM empresas ORDER BY ordem, CODEMP")
    .all(),
);

console.log("\n=== distribuicao de pedidos por CODEMP ===");
console.table(
  db
    .prepare(
      `SELECT CODEMP, COUNT(*) AS qt, ROUND(SUM(VLRNOTA), 2) AS vlr_total
       FROM pedidos
       GROUP BY CODEMP
       ORDER BY CODEMP`,
    )
    .all(),
);

console.log("\n=== distribuicao por TIPMOV (amostra) ===");
console.table(
  db
    .prepare(
      `SELECT TIPMOV, COUNT(*) AS qt, ROUND(SUM(VLRNOTA), 2) AS vlr_total
       FROM pedidos
       GROUP BY TIPMOV
       ORDER BY qt DESC`,
    )
    .all(),
);

console.log("\n=== TOPs com TIPMOV='V' (vendas) ===");
console.table(
  db
    .prepare(
      `SELECT CODTIPOPER, DESCROPER, TIPMOV
       FROM tipos_operacao
       WHERE TIPMOV = 'V'
       ORDER BY CODTIPOPER
       LIMIT 20`,
    )
    .all(),
);

console.log("\n=== simulacao /api/dashboard/empresa/faturamento (somente DTFATUR em 2026, todas empresas) ===");
console.table(
  db
    .prepare(
      `SELECT
         CODEMP,
         COUNT(*) AS qt_notas,
         ROUND(SUM(VLRNOTA), 2) AS faturamento
       FROM pedidos
       WHERE TIPMOV = 'V'
         AND STATUSNOTA = 'L'
         AND DTFATUR IS NOT NULL
         AND strftime('%Y', DTFATUR) = '2026'
       GROUP BY CODEMP
       ORDER BY faturamento DESC`,
    )
    .all(),
);

console.log("\n=== faturamento por periodo (consolidado) ===");
console.table(
  db
    .prepare(
      `WITH base AS (
         SELECT DTFATUR, VLRNOTA
         FROM pedidos
         WHERE TIPMOV = 'V' AND STATUSNOTA = 'L' AND DTFATUR IS NOT NULL
           AND strftime('%Y', DTFATUR) = '2026'
       )
       SELECT
         (SELECT ROUND(SUM(VLRNOTA), 2) FROM base WHERE DTFATUR = date('now')) AS dia,
         (SELECT ROUND(SUM(VLRNOTA), 2) FROM base WHERE DTFATUR >= date('now', '-6 days')) AS semana_7d,
         (SELECT ROUND(SUM(VLRNOTA), 2) FROM base WHERE strftime('%Y-%m', DTFATUR) = strftime('%Y-%m', 'now')) AS mes_atual,
         (SELECT ROUND(SUM(VLRNOTA), 2) FROM base) AS ano_atual`,
    )
    .all(),
);

db.close();
