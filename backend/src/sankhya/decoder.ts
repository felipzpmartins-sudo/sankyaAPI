import type { CrudFieldMeta, CrudRawResponse, DecodedEntity } from "./types.js";

export function decodeCrudResponse(raw: CrudRawResponse): {
  rows: DecodedEntity[];
  total: number;
  hasMore: boolean;
} {
  if (raw.status !== "1") {
    throw new Error(`Sankhya CRUD erro: ${raw.statusMessage ?? "desconhecido"}`);
  }

  const entities = raw.responseBody?.entities;
  if (!entities) return { rows: [], total: 0, hasMore: false };

  const meta = entities.metadata.fields.field;
  const fieldNames = (Array.isArray(meta) ? meta : [meta]).map(
    (f: CrudFieldMeta) => f.name,
  );

  const raw0 = entities.entity;
  const rawList = raw0 ? (Array.isArray(raw0) ? raw0 : [raw0]) : [];

  const rows: DecodedEntity[] = rawList.map((entity) => {
    const decoded: DecodedEntity = {};
    fieldNames.forEach((name, i) => {
      const cell = entity[`f${i}`];
      decoded[name] = cell && "$" in cell && cell.$ !== undefined ? cell.$ : null;
    });
    return decoded;
  });

  return {
    rows,
    total: Number(entities.total ?? rows.length),
    hasMore: entities.hasMoreResult === "true",
  };
}
