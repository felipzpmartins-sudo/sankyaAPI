import { z } from "zod";

export type EmpresaFiltro =
  | { modo: "todas" }
  | { modo: "lista"; ids: number[] };

const parseEmpresa = (raw: string): EmpresaFiltro => {
  const v = raw.trim();
  if (v === "" || v.toLowerCase() === "todas") return { modo: "todas" };

  const ids = v.split(",").map((s) => Number(s.trim()));
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new Error(
      "empresa: use 'todas', um inteiro (ex.: 1) ou lista separada por vírgula (ex.: 1,2,5)",
    );
  }
  return { modo: "lista", ids };
};

export const empresaParam = z
  .union([z.string(), z.coerce.number().int().positive()])
  .default("todas")
  .transform((v, ctx) => {
    try {
      return parseEmpresa(String(v));
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : "empresa inválida",
      });
      return z.NEVER;
    }
  });

export function empresaToSqlClause(
  filtro: EmpresaFiltro,
  coluna = "CODEMP",
): { clause: string; params: number[] } {
  if (filtro.modo === "todas") return { clause: "", params: [] };
  const placeholders = filtro.ids.map(() => "?").join(", ");
  return {
    clause: `${coluna} IN (${placeholders})`,
    params: filtro.ids,
  };
}
