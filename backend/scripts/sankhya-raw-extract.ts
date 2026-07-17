import { closeDb, getDb } from "../src/db/connection.js";
import { sankhyaRequest } from "../src/sankhya/client.js";
import { executeQuery } from "../src/sankhya/query.js";

type RawFieldMeta = {
  name: string;
  [key: string]: unknown;
};

type RawCell = { $?: string | number | null };

type RawCrudResponse = {
  status: "0" | "1";
  statusMessage?: string;
  responseBody?: {
    entities?: {
      total?: string;
      hasMoreResult?: string;
      offsetPage?: string;
      metadata?: { fields?: { field?: RawFieldMeta | RawFieldMeta[] } };
      entity?: Record<string, RawCell> | Record<string, RawCell>[];
    };
  };
};

type DecodedPage = {
  fields: RawFieldMeta[];
  rows: Record<string, string | number | null>[];
  total: number;
  hasMore: boolean;
};

type EntityInfo = {
  entity: string;
  description: string | null;
  tableName: string | null;
};

type Options = {
  mode: "inventory" | "sample" | "extract";
  entities: string[] | null;
  maxPages: number;
  maxRows: number;
  logEveryPages: number;
  expression: string;
  includePresentationFields: "S" | "N";
};

const FALLBACK_ENTITIES = [
  "Empresa",
  "Usuario",
  "Parceiro",
  "Contato",
  "Produto",
  "GrupoProduto",
  "CabecalhoNota",
  "ItemNota",
  "Financeiro",
  "Vendedor",
  "Comprador",
  "Estoque",
  "LocalFinanceiro",
  "TipoOperacao",
  "TipoTitulo",
  "TipoNegociacao",
  "Natureza",
  "CentroResultado",
  "Projeto",
  "Conta",
  "ContaBancaria",
  "MovimentoBancario",
  "Banco",
  "Cidade",
  "UnidadeFederativa",
  "Pais",
];

function argValue(name: string): string | null {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1] ?? null;
  return null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw == null) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseOptions(): Options {
  const modeRaw = argValue("--mode") ?? "sample";
  const mode = ["inventory", "sample", "extract"].includes(modeRaw)
    ? (modeRaw as Options["mode"])
    : "sample";
  const entitiesRaw = argValue("--entities");
  const includeRaw = (argValue("--includePresentationFields") ?? "N").toUpperCase();

  return {
    mode,
    entities: entitiesRaw
      ? entitiesRaw
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : null,
    maxPages: parsePositiveInt(argValue("--maxPages"), mode === "extract" ? 1000 : 1),
    maxRows: parsePositiveInt(argValue("--maxRows"), mode === "inventory" ? 0 : 100),
    logEveryPages: parsePositiveInt(argValue("--logEveryPages"), 10),
    expression: argValue("--expression") ?? "1=1",
    includePresentationFields: includeRaw === "S" ? "S" : "N",
  };
}

function ensureRawSchema(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS sankhya_raw_runs (
      run_id      TEXT PRIMARY KEY,
      mode        TEXT NOT NULL,
      started_at  TEXT NOT NULL,
      finished_at TEXT,
      status      TEXT NOT NULL,
      config_json TEXT NOT NULL,
      error       TEXT
    );

    CREATE TABLE IF NOT EXISTS sankhya_raw_entities (
      entity          TEXT PRIMARY KEY,
      description     TEXT,
      table_name      TEXT,
      status          TEXT NOT NULL,
      field_count     INTEGER NOT NULL DEFAULT 0,
      sample_count    INTEGER NOT NULL DEFAULT 0,
      total_reported  INTEGER,
      last_error      TEXT,
      last_probed_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sankhya_raw_fields (
      entity        TEXT NOT NULL,
      field_name    TEXT NOT NULL,
      field_order   INTEGER NOT NULL,
      raw_meta_json TEXT NOT NULL,
      last_seen_at  TEXT NOT NULL,
      PRIMARY KEY (entity, field_name)
    );

    CREATE TABLE IF NOT EXISTS sankhya_raw_records (
      run_id     TEXT NOT NULL,
      entity     TEXT NOT NULL,
      page       INTEGER NOT NULL,
      row_number INTEGER NOT NULL,
      data_json  TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (run_id, entity, page, row_number)
    );

    CREATE INDEX IF NOT EXISTS idx_sankhya_raw_records_entity
      ON sankhya_raw_records(entity);
  `);
}

async function crudLoadRaw(args: {
  entity: string;
  fieldset: string;
  expression: string;
  offsetPage: number;
  includePresentationFields: "S" | "N";
}): Promise<DecodedPage> {
  const raw = await sankhyaRequest<RawCrudResponse>({
    method: "POST",
    path: "/gateway/v1/mge/service.sbr",
    query: {
      serviceName: "CRUDServiceProvider.loadRecords",
      outputType: "json",
    },
    body: {
      serviceName: "CRUDServiceProvider.loadRecords",
      requestBody: {
        dataSet: {
          rootEntity: args.entity,
          includePresentationFields: args.includePresentationFields,
          offsetPage: String(args.offsetPage),
          criteria: { expression: { $: args.expression } },
          entity: { fieldset: { list: args.fieldset } },
        },
      },
    },
  });

  if (raw.status !== "1") {
    throw new Error(raw.statusMessage ?? "erro desconhecido no CRUDServiceProvider");
  }

  const entities = raw.responseBody?.entities;
  const fieldMeta = entities?.metadata?.fields?.field;
  const fields = fieldMeta ? (Array.isArray(fieldMeta) ? fieldMeta : [fieldMeta]) : [];
  const rawRows = entities?.entity
    ? Array.isArray(entities.entity)
      ? entities.entity
      : [entities.entity]
    : [];

  const rows = rawRows.map((row) => {
    const decoded: Record<string, string | number | null> = {};
    fields.forEach((field, index) => {
      const cell = row[`f${index}`];
      decoded[field.name] = cell && "$" in cell && cell.$ !== undefined ? cell.$ ?? null : null;
    });
    return decoded;
  });

  return {
    fields,
    rows,
    total: Number(entities?.total ?? rows.length),
    hasMore: entities?.hasMoreResult === "true",
  };
}

async function discoverEntities(opts: Options): Promise<EntityInfo[]> {
  if (opts.entities) {
    return opts.entities.map((entity) => ({ entity, description: null, tableName: null }));
  }

  try {
    const result = await executeQuery(`
      SELECT NOMEINST, DESCRINST, NOMETAB
      FROM TDDINS
      ORDER BY NOMEINST
    `);

    return result.rows
      .map((row) => ({
        entity: String(row[0] ?? "").trim(),
        description: row[1] == null ? null : String(row[1]),
        tableName: row[2] == null ? null : String(row[2]),
      }))
      .filter((row) => row.entity.length > 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Nao foi possivel listar TDDINS; usando lista fallback. Motivo: ${message}`);
    return FALLBACK_ENTITIES.map((entity) => ({ entity, description: null, tableName: null }));
  }
}

function upsertEntity(info: EntityInfo, status: string, values: {
  fieldCount?: number;
  sampleCount?: number;
  totalReported?: number | null;
  error?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO sankhya_raw_entities
         (entity, description, table_name, status, field_count, sample_count,
          total_reported, last_error, last_probed_at)
       VALUES
         (@entity, @description, @tableName, @status, @fieldCount, @sampleCount,
          @totalReported, @lastError, @lastProbedAt)
       ON CONFLICT(entity) DO UPDATE SET
         description    = COALESCE(excluded.description, sankhya_raw_entities.description),
         table_name     = COALESCE(excluded.table_name, sankhya_raw_entities.table_name),
         status         = excluded.status,
         field_count    = excluded.field_count,
         sample_count   = excluded.sample_count,
         total_reported = excluded.total_reported,
         last_error     = excluded.last_error,
         last_probed_at = excluded.last_probed_at`,
    )
    .run({
      entity: info.entity,
      description: info.description,
      tableName: info.tableName,
      status,
      fieldCount: values.fieldCount ?? 0,
      sampleCount: values.sampleCount ?? 0,
      totalReported: values.totalReported ?? null,
      lastError: values.error ?? null,
      lastProbedAt: new Date().toISOString(),
    });
}

function saveFields(entity: string, fields: RawFieldMeta[]): void {
  const now = new Date().toISOString();
  const stmt = getDb().prepare(
    `INSERT INTO sankhya_raw_fields
       (entity, field_name, field_order, raw_meta_json, last_seen_at)
     VALUES
       (@entity, @fieldName, @fieldOrder, @rawMetaJson, @lastSeenAt)
     ON CONFLICT(entity, field_name) DO UPDATE SET
       field_order   = excluded.field_order,
       raw_meta_json = excluded.raw_meta_json,
       last_seen_at  = excluded.last_seen_at`,
  );

  const tx = getDb().transaction(() => {
    fields.forEach((field, index) => {
      stmt.run({
        entity,
        fieldName: field.name,
        fieldOrder: index,
        rawMetaJson: JSON.stringify(field),
        lastSeenAt: now,
      });
    });
  });
  tx();
}

function saveRows(runId: string, entity: string, page: number, rows: Record<string, unknown>[]): void {
  const fetchedAt = new Date().toISOString();
  const stmt = getDb().prepare(
    `INSERT OR REPLACE INTO sankhya_raw_records
       (run_id, entity, page, row_number, data_json, fetched_at)
     VALUES
       (@runId, @entity, @page, @rowNumber, @dataJson, @fetchedAt)`,
  );

  const tx = getDb().transaction(() => {
    rows.forEach((row, index) => {
      stmt.run({
        runId,
        entity,
        page,
        rowNumber: index,
        dataJson: JSON.stringify(row),
        fetchedAt,
      });
    });
  });
  tx();
}

async function processEntity(runId: string, info: EntityInfo, opts: Options): Promise<void> {
  const meta = await crudLoadRaw({
    entity: info.entity,
    fieldset: "*",
    expression: "1=0",
    offsetPage: 0,
    includePresentationFields: "N",
  });

  saveFields(info.entity, meta.fields);

  if (opts.mode === "inventory") {
    upsertEntity(info, "inventory_ok", {
      fieldCount: meta.fields.length,
      sampleCount: 0,
      totalReported: 0,
    });
    console.log(`${info.entity}: inventario OK (${meta.fields.length} campos)`);
    return;
  }

  let totalSaved = 0;
  let totalReported: number | null = null;
  let page = 0;
  const fieldset = meta.fields.map((field) => field.name).join(",");

  while (true) {
    if (opts.maxPages > 0 && page >= opts.maxPages) break;
    if (opts.maxRows > 0 && totalSaved >= opts.maxRows) break;

    const result = await crudLoadRaw({
      entity: info.entity,
      fieldset: fieldset || "*",
      expression: opts.expression,
      offsetPage: page,
      includePresentationFields: opts.includePresentationFields,
    });

    totalReported = result.total;
    const remaining = opts.maxRows > 0 ? Math.max(opts.maxRows - totalSaved, 0) : result.rows.length;
    const rows = opts.maxRows > 0 ? result.rows.slice(0, remaining) : result.rows;
    saveRows(runId, info.entity, page, rows);
    totalSaved += rows.length;

    if (opts.logEveryPages > 0 && (page + 1) % opts.logEveryPages === 0) {
      const totalLabel = totalReported == null ? "?" : String(totalReported);
      console.log(
        `${info.entity}: pagina ${page + 1}, registros salvos ${totalSaved}/${totalLabel}`,
      );
    }

    if (!result.hasMore || result.rows.length === 0) break;
    page += 1;
  }

  upsertEntity(info, "extract_ok", {
    fieldCount: meta.fields.length,
    sampleCount: totalSaved,
    totalReported,
  });
  console.log(`${info.entity}: OK (${meta.fields.length} campos, ${totalSaved} registros salvos)`);
}

async function main(): Promise<void> {
  const opts = parseOptions();
  ensureRawSchema();

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${opts.mode}`;
  getDb()
    .prepare(
      `INSERT INTO sankhya_raw_runs
         (run_id, mode, started_at, status, config_json)
       VALUES (?, ?, ?, 'running', ?)`,
    )
    .run(runId, opts.mode, new Date().toISOString(), JSON.stringify(opts));

  let runError: string | null = null;

  try {
    const entities = await discoverEntities(opts);
    const list = hasFlag("--fallbackOnly")
      ? FALLBACK_ENTITIES.map((entity) => ({ entity, description: null, tableName: null }))
      : entities;

    console.log(`Run ${runId}: modo=${opts.mode}, entidades=${list.length}`);

    for (const info of list) {
      try {
        await processEntity(runId, info, opts);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        upsertEntity(info, "failed", { error: message });
        console.warn(`${info.entity}: FALHA - ${message}`);
      }
    }
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    getDb()
      .prepare(
        `UPDATE sankhya_raw_runs
         SET finished_at = ?, status = ?, error = ?
         WHERE run_id = ?`,
      )
      .run(new Date().toISOString(), runError ? "failed" : "done", runError, runId);
    closeDb();
  }
}

main().catch((err) => {
  console.error("erro fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
