import { sankhyaRequest } from "./client.js";

type QueryFieldMeta = {
  name?: string;
};

type ExecuteQueryRawResponse = {
  status: "0" | "1";
  statusMessage?: string;
  responseBody?: {
    fieldsMetadata?: QueryFieldMeta[];
    rows?: unknown[][];
  };
};

export type ExecuteQueryResult = {
  fields: string[];
  rows: unknown[][];
};

export async function executeQuery(sql: string): Promise<ExecuteQueryResult> {
  const raw = await sankhyaRequest<ExecuteQueryRawResponse>({
    method: "POST",
    path: "/gateway/v1/mge/service.sbr",
    query: {
      serviceName: "DbExplorerSP.executeQuery",
      outputType: "json",
    },
    body: {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: {
        sql,
      },
    },
  });

  if (raw.status !== "1") {
    throw new Error(`Sankhya query erro: ${raw.statusMessage ?? "desconhecido"}`);
  }

  return {
    fields: (raw.responseBody?.fieldsMetadata ?? []).map((f) => f.name ?? ""),
    rows: raw.responseBody?.rows ?? [],
  };
}
