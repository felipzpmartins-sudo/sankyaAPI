import { getDb } from "../db/connection.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

/**
 * Lista das 7 empresas do Grupo Maker descobertas via consulta exploratória
 * em `Financeiro` (a entidade `Empresa` é bloqueada para o usuário `BIMKR`).
 *
 * Quando a permissão da `Empresa` for liberada, trocar por full sync e manter
 * essa lista como fallback. Ver PLAN_DATA_BASE.md seção 15.1.
 */
const EMPRESAS_SEED = [
  { CODEMP: 1,  NOMEFANTASIA: "MAKER MATRIZ",          ordem: 1 },
  { CODEMP: 2,  NOMEFANTASIA: "MY ROBOT FRANQUEADORA", ordem: 2 },
  { CODEMP: 5,  NOMEFANTASIA: "MK CENTRO",             ordem: 3 },
  { CODEMP: 6,  NOMEFANTASIA: "MK E-COMMERCE",         ordem: 4 },
  { CODEMP: 8,  NOMEFANTASIA: "MAKER FILIAL",          ordem: 5 },
  { CODEMP: 11, NOMEFANTASIA: "MAKER ATACADISTA",      ordem: 6 },
  { CODEMP: 12, NOMEFANTASIA: "MAKER VAREJISTA",       ordem: 7 },
];

export function syncEmpresas(): void {
  try {
    const db = getDb();
    const now = new Date().toISOString();

    const upsert = db.prepare(
      `INSERT INTO empresas (CODEMP, NOMEFANTASIA, ativa, ordem, synced_at)
       VALUES (@CODEMP, @NOMEFANTASIA, 1, @ordem, @now)
       ON CONFLICT(CODEMP) DO UPDATE SET
         NOMEFANTASIA = excluded.NOMEFANTASIA,
         ordem        = excluded.ordem,
         synced_at    = excluded.synced_at`,
    );

    const tx = db.transaction(() => {
      for (const emp of EMPRESAS_SEED) {
        upsert.run({ ...emp, now });
      }
    });
    tx();

    recordSyncSuccess({
      entity: "empresas",
      rowCount: EMPRESAS_SEED.length,
      fullSync: true,
    });
  } catch (err) {
    recordSyncError("empresas", err);
    throw err;
  }
}
