import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { parseDateBR } from "../utils/dates.js";
import { parseDecimal, parseIntOrNull } from "../utils/numbers.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

/**
 * Conjunto mínimo de campos que destravam a tela 14.1 (faturamento).
 *
 * Campos removidos do conjunto inicial após erro "Descritor do campo 'X'
 * inválido" no primeiro sync (2026-05-14):
 *   - VLRDESC   → provavelmente `VLRDESCTOT` no Maker. Validar no Postman.
 *   - AD_OBS    → campo customizado, pode não existir nessa instalação.
 *   - DTENTSAI  → não testado, foi removido por precaução.
 *
 * Reincluir gradualmente cada um após validar individualmente.
 */
const FIELDS = [
  "NUNOTA",
  "CODEMP",
  "CODPARC",
  "CODVEND",
  "CODTIPOPER",
  "NUMNOTA",
  "SERIENOTA",
  "DTNEG",
  "DTFATUR",
  "STATUSNOTA",
  "VLRNOTA",
  "VLRFRETE",
];

const DATA_INICIO = "01/01/2025";

function buildTipmovMap(): Map<number, string> {
  const rows = getDb()
    .prepare("SELECT CODTIPOPER, TIPMOV FROM tipos_operacao")
    .all() as { CODTIPOPER: number; TIPMOV: string }[];

  const map = new Map<number, string>();
  for (const r of rows) map.set(r.CODTIPOPER, r.TIPMOV);
  return map;
}

/**
 * Insere uma empresa stub para CODEMPs encontrados no Sankhya mas não no seed.
 * Garante que o endpoint `/api/empresas` reflete o que realmente existe nos
 * dados sincronizados, mesmo antes do BIMKR ter permissão na entidade Empresa.
 */
function upsertEmpresaStub(codemp: number): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO empresas (CODEMP, NOMEFANTASIA, ativa, ordem, synced_at)
       VALUES (?, ?, 1, 99, ?)`,
    )
    .run(codemp, `EMPRESA ${codemp}`, new Date().toISOString());
}

export async function syncPedidos(): Promise<void> {
  try {
    const tipmovMap = buildTipmovMap();
    if (tipmovMap.size === 0) {
      throw new Error(
        "tipos_operacao vazio — rodar syncTiposOperacao antes de syncPedidos",
      );
    }

    const rows = await loadAllRecords({
      rootEntity: "CabecalhoNota",
      fields: FIELDS,
      expression: `this.DTNEG >= TO_DATE('${DATA_INICIO}','DD/MM/YYYY') AND this.STATUSNOTA = 'L'`,
    });

    const db = getDb();
    const now = new Date().toISOString();

    const upsert = db.prepare(
      `INSERT INTO pedidos
         (NUNOTA, CODEMP, CODPARC, CODVEND, CODTIPOPER, TIPMOV,
          NUMNOTA, SERIENOTA, DTNEG, DTFATUR, DTENTSAI, STATUSNOTA,
          VLRNOTA, VLRDESC, VLRFRETE, AD_OBS, synced_at)
       VALUES
         (@NUNOTA, @CODEMP, @CODPARC, @CODVEND, @CODTIPOPER, @TIPMOV,
          @NUMNOTA, @SERIENOTA, @DTNEG, @DTFATUR, @DTENTSAI, @STATUSNOTA,
          @VLRNOTA, @VLRDESC, @VLRFRETE, @AD_OBS, @synced_at)
       ON CONFLICT(NUNOTA) DO UPDATE SET
         CODEMP     = excluded.CODEMP,
         CODPARC    = excluded.CODPARC,
         CODVEND    = excluded.CODVEND,
         CODTIPOPER = excluded.CODTIPOPER,
         TIPMOV     = excluded.TIPMOV,
         NUMNOTA    = excluded.NUMNOTA,
         SERIENOTA  = excluded.SERIENOTA,
         DTNEG      = excluded.DTNEG,
         DTFATUR    = excluded.DTFATUR,
         DTENTSAI   = excluded.DTENTSAI,
         STATUSNOTA = excluded.STATUSNOTA,
         VLRNOTA    = excluded.VLRNOTA,
         VLRDESC    = excluded.VLRDESC,
         VLRFRETE   = excluded.VLRFRETE,
         AD_OBS     = excluded.AD_OBS,
         synced_at  = excluded.synced_at`,
    );

    const empresasConhecidas = new Set<number>(
      (db.prepare("SELECT CODEMP FROM empresas").all() as { CODEMP: number }[]).map(
        (r) => r.CODEMP,
      ),
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const r of rows) {
        const nunota = Number(r.NUNOTA);
        const codtipoper = Number(r.CODTIPOPER);
        if (!Number.isFinite(nunota) || !Number.isFinite(codtipoper)) continue;

        const codemp = Number(r.CODEMP);
        if (!empresasConhecidas.has(codemp)) {
          upsertEmpresaStub(codemp);
          empresasConhecidas.add(codemp);
        }

        upsert.run({
          NUNOTA: nunota,
          CODEMP: codemp,
          CODPARC: Number(r.CODPARC),
          CODVEND: parseIntOrNull(r.CODVEND),
          CODTIPOPER: codtipoper,
          TIPMOV: tipmovMap.get(codtipoper) ?? "?",
          NUMNOTA: parseIntOrNull(r.NUMNOTA),
          SERIENOTA: r.SERIENOTA ?? null,
          DTNEG: parseDateBR(r.DTNEG),
          DTFATUR: parseDateBR(r.DTFATUR),
          DTENTSAI: null,
          STATUSNOTA: r.STATUSNOTA ?? null,
          VLRNOTA: parseDecimal(r.VLRNOTA),
          VLRDESC: 0,
          VLRFRETE: parseDecimal(r.VLRFRETE),
          AD_OBS: null,
          synced_at: now,
        });
        inserted += 1;
      }
    });
    tx();

    recordSyncSuccess({
      entity: "pedidos",
      rowCount: inserted,
      fullSync: true,
    });
  } catch (err) {
    recordSyncError("pedidos", err);
    throw err;
  }
}
