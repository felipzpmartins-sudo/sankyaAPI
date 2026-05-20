/**
 * Faz parse defensivo de valores numéricos vindos do Sankhya.
 *
 * Tenta primeiro o formato US (ex.: `"1234.56"`). Se falhar (NaN), faz fallback
 * para o formato BR (`"1.234,56"` → `1234.56`).
 *
 * Risco conhecido: `"1.234"` em US vale `1.234` (parse direto retorna isso),
 * mas em BR seria `1234`. Como valores monetários do Sankhya em geral vêm com
 * casas decimais (`"1234.56"` ou `"1.234,56"`), a ambiguidade na prática
 * não acontece. Reavaliar se o teste no Postman (item 6 do PLAN_REVIEW)
 * mostrar que o formato é diferente do esperado.
 */
export function parseDecimal(v: string | null | undefined): number {
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s) return 0;

  const direct = Number(s);
  if (Number.isFinite(direct)) return direct;

  const br = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(br) ? br : 0;
}

export function parseIntOrNull(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
