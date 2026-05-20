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

  db.exec(sql);

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
