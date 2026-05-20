import { z } from "zod";

export type VendedorFiltro =
  | { modo: "todos" }
  | { modo: "lista"; ids: number[] };

const parseVendedor = (raw: string): VendedorFiltro => {
  const v = raw.trim();
  if (v === "" || v.toLowerCase() === "todos") return { modo: "todos" };

  const ids = v.split(",").map((s) => Number(s.trim()));
  if (ids.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(
      "vendedor: use 'todos', um inteiro (ex.: 7) ou lista separada por vírgula (ex.: 7,13)",
    );
  }
  return { modo: "lista", ids };
};

export const vendedorParam = z
  .union([z.string(), z.coerce.number().int().nonnegative()])
  .default("todos")
  .transform((v, ctx) => {
    try {
      return parseVendedor(String(v));
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : "vendedor inválido",
      });
      return z.NEVER;
    }
  });

export function vendedorToSqlClause(
  filtro: VendedorFiltro,
  coluna = "CODVEND",
): { clause: string; params: number[] } {
  if (filtro.modo === "todos") return { clause: "", params: [] };
  const placeholders = filtro.ids.map(() => "?").join(", ");
  return {
    clause: `${coluna} IN (${placeholders})`,
    params: filtro.ids,
  };
}

export function describeVendedorFiltro(filtro: VendedorFiltro): string {
  return filtro.modo === "todos" ? "todos" : `lista[${filtro.ids.join(",")}]`;
}
