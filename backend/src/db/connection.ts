import Database, { type Database as DatabaseType } from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "../config.js";

let instance: DatabaseType | null = null;

export function getDb(): DatabaseType {
  if (instance) return instance;

  const absPath = resolve(process.cwd(), config.DATABASE_PATH);
  mkdirSync(dirname(absPath), { recursive: true });

  const db = new Database(absPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("temp_store = MEMORY");
  db.pragma("busy_timeout = 5000");
  db.pragma("cache_size = -20000");

  instance = db;
  return db;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
