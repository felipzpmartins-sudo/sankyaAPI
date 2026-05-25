import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./connection.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, "./schema.sql");

const EXPECTED_SCHEMA_VERSION = "2";

export type MigrateResult = {
  schemaVersion: string;
  tables: number;
  indexes: number;
};

export function migrate(): MigrateResult {
  const db = getDb();
  const sql = readFileSync(SCHEMA_PATH, "utf8");

  preMigrateProdutoEstoqueShape();
  db.exec(sql);
  migrateParceirosShape();
  migrateProdutosShape();
  migrateProdutoEstoqueShape();

  const versionRow = db
    .prepare("SELECT value FROM metadata WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;

  const schemaVersion = versionRow?.value ?? "unknown";

  if (schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(
      `Schema version mismatch: banco em '${schemaVersion}', código espera '${EXPECTED_SCHEMA_VERSION}'. ` +
        `Migration manual necessária — ver PLAN_DATA_BASE.md seção 13 (riscos).`,
    );
  }

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%') AS tables,
         (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%') AS indexes`,
    )
    .get() as { tables: number; indexes: number };

  return {
    schemaVersion,
    tables: counts.tables,
    indexes: counts.indexes,
  };
}

function migrateParceirosShape(): void {
  const db = getDb();
  const columns = db.prepare("PRAGMA table_info(parceiros)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((col) => col.name));

  const additions: Array<[string, string]> = [
    ["EMAIL", "ALTER TABLE parceiros ADD COLUMN EMAIL TEXT"],
    ["TELEFONE", "ALTER TABLE parceiros ADD COLUMN TELEFONE TEXT"],
    ["CELULAR", "ALTER TABLE parceiros ADD COLUMN CELULAR TEXT"],
    ["DTCAD", "ALTER TABLE parceiros ADD COLUMN DTCAD TEXT"],
    ["LIMCRED", "ALTER TABLE parceiros ADD COLUMN LIMCRED REAL NOT NULL DEFAULT 0"],
  ];

  for (const [name, sql] of additions) {
    if (!names.has(name)) db.exec(sql);
  }
}

function migrateProdutosShape(): void {
  const db = getDb();
  const columns = db.prepare("PRAGMA table_info(produtos)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((col) => col.name));

  const additions: Array<[string, string]> = [
    ["MARCA", "ALTER TABLE produtos ADD COLUMN MARCA TEXT"],
    ["USOPROD", "ALTER TABLE produtos ADD COLUMN USOPROD TEXT"],
    ["CODVOL", "ALTER TABLE produtos ADD COLUMN CODVOL TEXT"],
  ];

  for (const [name, sql] of additions) {
    if (!names.has(name)) db.exec(sql);
  }
}

function preMigrateProdutoEstoqueShape(): void {
  const db = getDb();
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'produto_estoque'")
    .get() as { name: string } | undefined;

  if (!table) return;

  const columns = db.prepare("PRAGMA table_info(produto_estoque)").all() as Array<{ name: string }>;
  const hasCodemp = columns.some((col) => col.name === "CODEMP");
  const hasControle = columns.some((col) => col.name === "CONTROLE");

  if (hasCodemp && hasControle) return;

  db.exec("DROP TABLE IF EXISTS produto_estoque");
}

function migrateProdutoEstoqueShape(): void {
  const db = getDb();
  const columns = db.prepare("PRAGMA table_info(produto_estoque)").all() as Array<{ name: string }>;
  const hasCodemp = columns.some((col) => col.name === "CODEMP");
  const hasControle = columns.some((col) => col.name === "CONTROLE");

  if (hasCodemp && hasControle) return;

  db.exec(`
    DROP TABLE IF EXISTS produto_estoque;

    CREATE TABLE produto_estoque (
      CODEMP        INTEGER NOT NULL DEFAULT 0,
      CODPROD       INTEGER NOT NULL,
      CODLOCALORIG  INTEGER NOT NULL DEFAULT 0,
      CONTROLE      TEXT NOT NULL DEFAULT '',
      CODPARC       INTEGER NOT NULL DEFAULT 0,
      TIPO          TEXT NOT NULL DEFAULT '',
      ESTOQUE       REAL NOT NULL DEFAULT 0,
      EST_MINIMO    REAL NOT NULL DEFAULT 0,
      EST_MAXIMO    REAL NOT NULL DEFAULT 0,
      UNIDADE       TEXT,
      LOCAL_DESCR   TEXT,
      EMPRESA_NOMEFANTASIA TEXT,
      PARCEIRO_NOMEPARC TEXT,
      synced_at     TEXT NOT NULL,
      PRIMARY KEY (CODEMP, CODPROD, CODLOCALORIG, CONTROLE, CODPARC, TIPO),
      FOREIGN KEY (CODPROD) REFERENCES produtos(CODPROD)
    );

    CREATE INDEX IF NOT EXISTS idx_produto_estoque_prod ON produto_estoque(CODPROD);
    CREATE INDEX IF NOT EXISTS idx_produto_estoque_emp ON produto_estoque(CODEMP);
  `);
}
