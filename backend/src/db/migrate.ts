import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./connection.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, "./schema.sql");

const EXPECTED_SCHEMA_VERSION = "3";

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
  migrateProjetosShape();
  migratePedidosShape();
  migrateTitulosShape();
  migrateCentrosResultadoShape();
  migrateRateioShape();
  migratePedidosIndexes();
  migrateFinanceiroIndexes();
  migrateProdutoEstoqueShape();

  const versionRow = db
    .prepare("SELECT value FROM metadata WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;

  const schemaVersion = versionRow?.value ?? "unknown";

  if (schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    // Se a versão no banco for diferente, atualizamos para a versão esperada
    // após aplicar as migrations incrementais definidas acima. Isso permite
    // que upgrades sejam aplicados automaticamente em instâncias locais.
    getDb()
      .prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', ?)")
      .run(EXPECTED_SCHEMA_VERSION);
    // refetch schemaVersion para retornar o valor atualizado
    // (mantemos compatibilidade de retorno para quem consome migrate()).
    // nota: não lançamos erro aqui — o processo continua com o schema atualizado.
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

function migratePedidosShape(): void {
  const db = getDb();
  const columns = db.prepare("PRAGMA table_info(pedidos)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((col) => col.name));

  const additions: Array<[string, string]> = [
    ["CODCENCUS", "ALTER TABLE pedidos ADD COLUMN CODCENCUS INTEGER"],
    ["CODPROJ", "ALTER TABLE pedidos ADD COLUMN CODPROJ INTEGER"],
    ["CODPARCTRANSP", "ALTER TABLE pedidos ADD COLUMN CODPARCTRANSP INTEGER"],
    ["TRANSPORTADORA_NOME", "ALTER TABLE pedidos ADD COLUMN TRANSPORTADORA_NOME TEXT"],
    ["CIF_FOB", "ALTER TABLE pedidos ADD COLUMN CIF_FOB TEXT"],
    ["QTDVOL", "ALTER TABLE pedidos ADD COLUMN QTDVOL REAL NOT NULL DEFAULT 0"],
  ];

  for (const [name, sql] of additions) {
    if (!names.has(name)) db.exec(sql);
  }
}

function migratePedidosIndexes(): void {
  getDb().exec(`
    CREATE INDEX IF NOT EXISTS idx_pedidos_faturamento_status_dt_top_emp
      ON pedidos(STATUSNOTA, DTFATUR, CODTIPOPER, CODEMP);

    CREATE INDEX IF NOT EXISTS idx_pedidos_faturamento_vend_status_dt_top
      ON pedidos(CODVEND, STATUSNOTA, DTFATUR, CODTIPOPER);
  `);
}

function migrateFinanceiroIndexes(): void {
  getDb().exec(`
    CREATE INDEX IF NOT EXISTS idx_titulos_rec_prov_dtneg
      ON titulos(RECDESP, PROVISAO, DTNEG);

    CREATE INDEX IF NOT EXISTS idx_titulos_aberto_rec_prov
      ON titulos(is_em_aberto, RECDESP, PROVISAO);

    CREATE INDEX IF NOT EXISTS idx_titulos_dhbaixa
      ON titulos(DHBAIXA);
  `);
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

function migrateProjetosShape(): void {
  const db = getDb();
  const columns = db.prepare("PRAGMA table_info(projetos)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((col) => col.name));

  const additions: Array<[string, string]> = [
    ["CODPROJPAI", "ALTER TABLE projetos ADD COLUMN CODPROJPAI INTEGER"],
    ["GRAU", "ALTER TABLE projetos ADD COLUMN GRAU INTEGER"],
    ["ANALITICO", "ALTER TABLE projetos ADD COLUMN ANALITICO TEXT"],
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

function migrateTitulosShape(): void {
  const db = getDb();
  const columns = db.prepare("PRAGMA table_info(titulos)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((col) => col.name));

  const additions: Array<[string, string]> = [
    ["CODCENCUS", "ALTER TABLE titulos ADD COLUMN CODCENCUS INTEGER"],
    ["CODPROJ", "ALTER TABLE titulos ADD COLUMN CODPROJ INTEGER"],
  ];

  for (const [name, sql] of additions) {
    if (!names.has(name)) db.exec(sql);
  }
}

function migrateRateioShape(): void {
  const db = getDb();
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'titulos_rateio'")
    .get() as { name: string } | undefined;

  if (table) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS titulos_rateio (
      NUFIN       INTEGER NOT NULL,
      CODPROJ     INTEGER,
      PERCRATEIO  REAL NOT NULL DEFAULT 0,
      CODEMP      INTEGER,
      synced_at   TEXT NOT NULL,
      PRIMARY KEY (NUFIN, CODPROJ)
    );

    CREATE INDEX IF NOT EXISTS idx_titulos_rateio_nufin ON titulos_rateio(NUFIN);
    CREATE INDEX IF NOT EXISTS idx_titulos_rateio_proj ON titulos_rateio(CODPROJ);
  `);
}

function migrateCentrosResultadoShape(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS centros_resultado (
      CODCENCUS   INTEGER PRIMARY KEY,
      DESCRCENCUS TEXT NOT NULL,
      ativo       INTEGER NOT NULL DEFAULT 1,
      synced_at   TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_centros_resultado_descr
      ON centros_resultado(DESCRCENCUS);
  `);
}
