import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { parseDateBR, parseDateTimeBR } from "../utils/dates.js";
import { parseDecimal } from "../utils/numbers.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

/**
 * Conjunto de campos do TGFFIN suficiente para DRE + fluxo de caixa +
 * contas a receber/pagar. Validados via `scripts/explore-sankhya.ts`.
 *
 * Campos NÃO incluídos (testar antes de adicionar):
 *   - DTBAIXA, DTPAGAMENTO, DTLIQUIDACAO, STATUS, VLRBAIXADO → 'Descritor inválido'
 *
 * `DHBAIXA` é DATA da baixa (formato 'dd/MM/yyyy'), apesar do prefixo DH —
 * o Sankhya guarda como data simples nesse campo. Já `DHCONCIL` é
 * data/hora completa.
 */
const FIELDS = [
  "NUFIN",
  "CODEMP",
  "CODPARC",
  "CODCENCUS",
  "CODPROJ",
  "CODTIPTIT",
  "CODNAT",
  "RECDESP",
  "PROVISAO",
  "DTNEG",
  "DTVENC",
  "DHBAIXA",
  "DHCONCIL",
  "DTCONTAB",
  "VLRDESDOB",
  "VLRBAIXA",
];

/**
 * Janela inicial reduzida para o ano atual, suficiente para a tela 14.2
 * (DRE, fluxo de caixa do "ano"). Para DRE comparativo e fluxo de caixa
 * 12m rolantes, ampliar para 2025-01-01 numa próxima iteração — o primeiro
 * sync dessa janela maior leva ~10min (volume da TGFFIN).
 */
const DATA_INICIO = "01/01/2025";

function upsertEmpresaStub(codemp: number): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO empresas (CODEMP, NOMEFANTASIA, ativa, ordem, synced_at)
       VALUES (?, ?, 1, 99, ?)`,
    )
    .run(codemp, `EMPRESA ${codemp}`, new Date().toISOString());
}

export async function syncTitulos(): Promise<void> {
  try {
    const rows = await loadAllRecords({
      rootEntity: "Financeiro",
      fields: FIELDS,
      expression: `this.DTNEG >= TO_DATE('${DATA_INICIO}','DD/MM/YYYY')`,
    });

    const db = getDb();
    const now = new Date().toISOString();

    const empresasConhecidas = new Set<number>(
      (db.prepare("SELECT CODEMP FROM empresas").all() as { CODEMP: number }[]).map(
        (r) => r.CODEMP,
      ),
    );

    const upsert = db.prepare(
      `INSERT INTO titulos
          (NUFIN, CODEMP, CODPARC, CODCENCUS, CODPROJ, CODTIPTIT, CODNAT, RECDESP, PROVISAO, tipo,
          DTNEG, DTVENC, DHBAIXA, DHCONCIL, DTCONTAB,
            VLRDESDOB, VLRBAIXA, valor_aberto, is_em_aberto, synced_at)
       VALUES
          (@NUFIN, @CODEMP, @CODPARC, @CODCENCUS, @CODPROJ, @CODTIPTIT, @CODNAT, @RECDESP, @PROVISAO, @tipo,
          @DTNEG, @DTVENC, @DHBAIXA, @DHCONCIL, @DTCONTAB,
          @VLRDESDOB, @VLRBAIXA, @valor_aberto, @is_em_aberto, @synced_at)
       ON CONFLICT(NUFIN) DO UPDATE SET
         CODEMP       = excluded.CODEMP,
         CODPARC      = excluded.CODPARC,
         CODCENCUS    = excluded.CODCENCUS,
         CODPROJ      = excluded.CODPROJ,
         CODTIPTIT    = excluded.CODTIPTIT,
         CODNAT       = excluded.CODNAT,
         RECDESP      = excluded.RECDESP,
         PROVISAO     = excluded.PROVISAO,
         tipo         = excluded.tipo,
         DTNEG        = excluded.DTNEG,
         DTVENC       = excluded.DTVENC,
         DHBAIXA      = excluded.DHBAIXA,
         DHCONCIL     = excluded.DHCONCIL,
         DTCONTAB     = excluded.DTCONTAB,
         VLRDESDOB    = excluded.VLRDESDOB,
         VLRBAIXA     = excluded.VLRBAIXA,
         valor_aberto = excluded.valor_aberto,
         is_em_aberto = excluded.is_em_aberto,
         synced_at    = excluded.synced_at`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const r of rows) {
        const nufin = Number(r.NUFIN);
        const codemp = Number(r.CODEMP);
        const codparc = Number(r.CODPARC);
        const recdesp = Number(r.RECDESP);

        if (
          !Number.isFinite(nufin) ||
          !Number.isFinite(codemp) ||
          !Number.isFinite(codparc) ||
          !Number.isFinite(recdesp)
        ) {
          continue;
        }

        if (!empresasConhecidas.has(codemp)) {
          upsertEmpresaStub(codemp);
          empresasConhecidas.add(codemp);
        }

        const dhbaixa = parseDateBR(r.DHBAIXA);
        const vlrdesdob = parseDecimal(r.VLRDESDOB);
        const vlrbaixa = parseDecimal(r.VLRBAIXA);
        const isEmAberto = dhbaixa === null;
        const valorAberto = isEmAberto ? vlrdesdob - vlrbaixa : 0;
        const tipo: "receber" | "pagar" = recdesp > 0 ? "receber" : "pagar";

        upsert.run({
          NUFIN: nufin,
          CODEMP: codemp,
          CODPARC: codparc,
          CODCENCUS: r.CODCENCUS != null ? Number(r.CODCENCUS) : null,
          CODPROJ: r.CODPROJ != null ? Number(r.CODPROJ) : null,
          CODTIPTIT: r.CODTIPTIT != null ? Number(r.CODTIPTIT) : null,
          CODNAT: r.CODNAT != null ? Number(r.CODNAT) : null,
          RECDESP: recdesp,
          PROVISAO: r.PROVISAO ?? null,
          tipo,
          DTNEG: parseDateBR(r.DTNEG),
          DTVENC: parseDateBR(r.DTVENC),
          DHBAIXA: dhbaixa,
          DHCONCIL: parseDateTimeBR(r.DHCONCIL),
          DTCONTAB: parseDateBR(r.DTCONTAB),
          VLRDESDOB: vlrdesdob,
          VLRBAIXA: vlrbaixa,
          valor_aberto: valorAberto,
          is_em_aberto: isEmAberto ? 1 : 0,
          synced_at: now,
        });
        inserted += 1;
      }
    });
    tx();

    recordSyncSuccess({ entity: "titulos", rowCount: inserted, fullSync: true });
  } catch (err) {
    recordSyncError("titulos", err);
    throw err;
  }
}
