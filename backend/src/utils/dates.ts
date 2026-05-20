/**
 * Converte data Sankhya `dd/MM/yyyy` (ou `dd/MM/yyyy HH:mm:ss`) para ISO `YYYY-MM-DD`.
 * Retorna `null` se a entrada for vazia ou não bater no padrão.
 */
export function parseDateBR(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Converte data+hora Sankhya `dd/MM/yyyy HH:mm:ss` para ISO `YYYY-MM-DD HH:MM:SS`.
 * Se vier só data, retorna `YYYY-MM-DD`.
 */
export function parseDateTimeBR(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?/);
  if (!m) return null;
  return m[4] ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}` : `${m[3]}-${m[2]}-${m[1]}`;
}
