/**
 * Alinhado ao query `vendedor` do backend (`todos` | CODVEND).
 *
 * `CODVEND=0` é valor legítimo (`<SEM VENDEDOR>`), por isso o tipo aceita
 * qualquer inteiro não-negativo. Lista (`1,2,5`) suportada pelo backend mas
 * UI atual só permite seleção única — extensível depois.
 */
export type VendedorSeleção = "todos" | number;

export function vendedorKey(sel: VendedorSeleção): string {
  return sel === "todos" ? "todos" : String(sel);
}

/** Retorna `undefined` para "todos" — assim o `apiJson` omite o parâmetro da URL. */
export function vendedorQueryValue(sel: VendedorSeleção): string | number | undefined {
  return sel === "todos" ? undefined : sel;
}
