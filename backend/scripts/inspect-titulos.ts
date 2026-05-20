import Database from "better-sqlite3";

const db = new Database("data/snapshot.db", { readonly: true });

console.log("=== sync_state ===");
console.table(
  db
    .prepare("SELECT entity, last_synced_at, success_count, error_count, row_count FROM sync_state ORDER BY entity")
    .all(),
);

console.log("\n=== contagem titulos ===");
console.table([db.prepare("SELECT COUNT(*) AS total FROM titulos").get()]);

console.log("\n=== titulos por tipo + em_aberto ===");
console.table(
  db
    .prepare(
      `SELECT tipo, is_em_aberto, COUNT(*) AS qt, ROUND(SUM(VLRDESDOB), 2) AS soma_total, ROUND(SUM(valor_aberto), 2) AS soma_aberto
       FROM titulos
       GROUP BY tipo, is_em_aberto
       ORDER BY tipo, is_em_aberto`,
    )
    .all(),
);

console.log("\n=== titulos por CODEMP ===");
console.table(
  db
    .prepare(
      `SELECT CODEMP, COUNT(*) AS qt, ROUND(SUM(VLRDESDOB), 2) AS soma
       FROM titulos
       GROUP BY CODEMP
       ORDER BY CODEMP`,
    )
    .all(),
);

console.log("\n=== simulacao DRE 2026 todas empresas ===");
const dre = db
  .prepare(
    `SELECT
       (SELECT ROUND(COALESCE(SUM(VLRDESDOB),0),2) FROM titulos WHERE PROVISAO='N' AND RECDESP=1  AND CAST(COALESCE(CODNAT,0) AS TEXT) LIKE '1%' AND strftime('%Y', DTNEG)=strftime('%Y','now')) AS receita_bruta,
       (SELECT ROUND(COALESCE(SUM(VLRDESDOB),0),2) FROM titulos WHERE PROVISAO='N' AND RECDESP=-1 AND CAST(COALESCE(CODNAT,0) AS TEXT) LIKE '2%' AND strftime('%Y', DTNEG)=strftime('%Y','now')) AS custos,
       (SELECT ROUND(COALESCE(SUM(VLRDESDOB),0),2) FROM titulos WHERE PROVISAO='N' AND RECDESP=-1 AND CAST(COALESCE(CODNAT,0) AS TEXT) LIKE '3%' AND strftime('%Y', DTNEG)=strftime('%Y','now')) AS desp_admin,
       (SELECT ROUND(COALESCE(SUM(VLRDESDOB),0),2) FROM titulos WHERE PROVISAO='N' AND RECDESP=-1 AND CAST(COALESCE(CODNAT,0) AS TEXT) LIKE '4%' AND strftime('%Y', DTNEG)=strftime('%Y','now')) AS desp_comerc,
       (SELECT ROUND(COALESCE(SUM(VLRDESDOB),0),2) FROM titulos WHERE PROVISAO='N' AND RECDESP=-1 AND CAST(COALESCE(CODNAT,0) AS TEXT) LIKE '5%' AND strftime('%Y', DTNEG)=strftime('%Y','now')) AS impostos`,
  )
  .get();
console.table([dre]);

db.close();
