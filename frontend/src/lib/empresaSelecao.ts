/** Alinhado ao query `empresa` do backend (`todas` | CODEMP). */
export type EmpresaSeleção = "todas" | number;
export type EmpresaSelecao = EmpresaSeleção;

export function empresaKey(sel: EmpresaSeleção): string {
  return sel === "todas" ? "todas" : String(sel);
}

export function empresaQueryValue(sel: EmpresaSeleção): string | number {
  return sel === "todas" ? "todas" : sel;
}
