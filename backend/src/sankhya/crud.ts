import { sankhyaRequest } from "./client.js";
import { decodeCrudResponse } from "./decoder.js";
import type { CrudRawResponse, DecodedEntity, LoadRecordsResult } from "./types.js";

export type LoadRecordsArgs = {
  rootEntity: string;
  fields: string[];
  expression?: string;
  offsetPage?: number;
};

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

export async function loadAllRecords(args: LoadRecordsArgs): Promise<DecodedEntity[]> {
  const all: DecodedEntity[] = [];
  let page = 0;
  while (true) {
    const result = await loadRecords({ ...args, offsetPage: page });
    all.push(...result.rows);
    if (!result.hasMore || result.rows.length === 0) break;
    page += 1;
    if (page > 1000) throw new Error("loadAllRecords: limite de paginação excedido");
  }
  return all;
}
