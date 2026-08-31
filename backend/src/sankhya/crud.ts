import { sankhyaRequest } from "./client.js";
import { decodeCrudResponse } from "./decoder.js";
import type { CrudRawResponse, DecodedEntity, LoadRecordsResult } from "./types.js";

export type LoadRecordsArgs = {
  rootEntity: string;
  fields: string[];
  expression?: string;
  offsetPage?: number;
};

const RETRY_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message === "fetch failed") return true;
  // AbortSignal.timeout lanca DOMException TimeoutError, que nao traz cause.
  if (err.name === "TimeoutError" || err.name === "AbortError") return true;
  if (/^Sankhya (429|5\d\d):/.test(err.message)) return true;

  const cause = err.cause;
  if (cause instanceof Error) {
    return /timeout|ECONNRESET|ENOTFOUND|EAI_AGAIN|UND_ERR/i.test(
      `${cause.name} ${cause.message}`,
    );
  }

  return false;
}

export async function loadRecords(args: LoadRecordsArgs): Promise<LoadRecordsResult> {
  const raw = await sankhyaRequest<CrudRawResponse>({
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
          rootEntity: args.rootEntity,
          includePresentationFields: "S",
          offsetPage: String(args.offsetPage ?? 0),
          criteria: { expression: { $: args.expression ?? "1=1" } },
          entity: { fieldset: { list: args.fields.join(",") } },
        },
      },
    },
  });

  return decodeCrudResponse(raw);
}

async function loadRecordsWithRetry(args: LoadRecordsArgs): Promise<LoadRecordsResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await loadRecords(args);
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt === RETRY_ATTEMPTS) break;
      await sleep(750 * attempt);
    }
  }

  throw lastError;
}

export async function loadAllRecords(args: LoadRecordsArgs): Promise<DecodedEntity[]> {
  const all: DecodedEntity[] = [];
  let page = 0;
  while (true) {
    const result = await loadRecordsWithRetry({ ...args, offsetPage: page });
    all.push(...result.rows);
    if (!result.hasMore || result.rows.length === 0) break;
    page += 1;
    if (page > 1000) throw new Error("loadAllRecords: limite de paginação excedido");
  }
  return all;
}
