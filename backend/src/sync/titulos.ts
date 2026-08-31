import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { parseDateBR, parseDateTimeBR } from "../utils/dates.js";
import { parseDecimal } from "../utils/numbers.js";
import pino from "pino";
import { config } from "../config.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const logger = pino({ level: config.LOG_LEVEL, transport: { target: "pino-pretty", options: { colorize: true } } });

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
  "NUNOTA",
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
  // Composicao do valor: sem estes campos nao da para dizer se o valor do
  // titulo embute juros, multa ou desconto — validados um a um contra a API.
  "VLRJURO",
  "VLRMULTA",
  "VLRDESC",
  // HISTORICO descreve a operacao ("RECOMPRA NF. 218...", "Taxas de Desconto").
  "HISTORICO",
  // Flag nativa do Sankhya para rateio. Serve de conferencia independente da
  // classificacao que o painel deriva da TGFRAT.
  "RATEADO",
  "NUMNOTA",
  "SERIENOTA",
];

/**
 * Janela inicial reduzida para o ano atual, suficiente para a tela 14.2
 * (DRE, fluxo de caixa do "ano"). Para DRE comparativo e fluxo de caixa
 * 12m rolantes, ampliar para 2025-01-01 numa próxima iteração — o primeiro
 * sync dessa janela maior leva ~10min (volume da TGFFIN).
 */
const DATA_INICIO = "01/01/2025";
/** Mesma janela de DATA_INICIO, no formato em que DTNEG e gravado no SQLite. */
const DATA_INICIO_ISO = "2025-01-01";

/**
 * Teto de seguranca para a remocao de orfaos. A paginacao do Sankhya roda
 * sobre tabela viva: se uma resposta vier truncada, tudo que faltou pareceria
 * excluido no ERP. Acima deste limite a limpeza e ignorada e registrada.
 */
const LIMITE_REMOCAO_PCT = 0.05;
const LIMITE_REMOCAO_MIN = 100;

function texto(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

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
          (NUFIN, NUNOTA, CODEMP, CODPARC, CODCENCUS, CODPROJ, CODTIPTIT, CODNAT, RECDESP, PROVISAO, tipo,
          DTNEG, DTVENC, DHBAIXA, DHCONCIL, DTCONTAB,
            VLRDESDOB, VLRBAIXA, VLRJURO, VLRMULTA, VLRDESC,
            HISTORICO, RATEADO, NUMNOTA, SERIENOTA,
            valor_aberto, is_em_aberto, synced_at)
       VALUES
          (@NUFIN, @NUNOTA, @CODEMP, @CODPARC, @CODCENCUS, @CODPROJ, @CODTIPTIT, @CODNAT, @RECDESP, @PROVISAO, @tipo,
          @DTNEG, @DTVENC, @DHBAIXA, @DHCONCIL, @DTCONTAB,
            @VLRDESDOB, @VLRBAIXA, @VLRJURO, @VLRMULTA, @VLRDESC,
            @HISTORICO, @RATEADO, @NUMNOTA, @SERIENOTA,
            @valor_aberto, @is_em_aberto, @synced_at)
       ON CONFLICT(NUFIN) DO UPDATE SET
         NUNOTA       = excluded.NUNOTA,
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
         VLRJURO      = excluded.VLRJURO,
         VLRMULTA     = excluded.VLRMULTA,
         VLRDESC      = excluded.VLRDESC,
         HISTORICO    = excluded.HISTORICO,
         RATEADO      = excluded.RATEADO,
         NUMNOTA      = excluded.NUMNOTA,
         SERIENOTA    = excluded.SERIENOTA,
         valor_aberto = excluded.valor_aberto,
         is_em_aberto = excluded.is_em_aberto,
         synced_at    = excluded.synced_at`,
    );

    // Sem isto o sync so faz upsert: titulo excluido no Sankhya nunca sai do
    // snapshot, fica orfao de rateio (que e reconstruido do zero a cada ciclo)
    // e reaparece no painel como "sem distribuicao".
    db.exec("CREATE TEMP TABLE IF NOT EXISTS _titulos_vistos (NUFIN INTEGER PRIMARY KEY)");
    const marcarVisto = db.prepare("INSERT OR IGNORE INTO _titulos_vistos (NUFIN) VALUES (?)");
    const filtroJanela = "DTNEG >= ? AND NUFIN NOT IN (SELECT NUFIN FROM _titulos_vistos)";
    const contarOrfaos = db.prepare(`SELECT COUNT(*) AS total FROM titulos WHERE ${filtroJanela}`);
    const removerOrfaos = db.prepare(`DELETE FROM titulos WHERE ${filtroJanela}`);
    const contarJanela = db.prepare("SELECT COUNT(*) AS total FROM titulos WHERE DTNEG >= ?");

    type ResultadoLimpeza = {
      removidos: number;
      ignorada: { orfaos: number; limite: number } | null;
    };

    let inserted = 0;
    const tx = db.transaction((): ResultadoLimpeza => {
      db.prepare("DELETE FROM _titulos_vistos").run();
      for (const r of rows) {
        const nufin = Number(r.NUFIN);
        const codemp = Number(r.CODEMP);
        const codparc = Number(r.CODPARC);
        const recdesp = Number(r.RECDESP);

        // Marcado antes das demais validacoes: a linha existe no Sankhya
        // mesmo que seja descartada aqui, entao nao pode contar como orfa.
        if (Number.isFinite(nufin)) marcarVisto.run(nufin);

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
          NUNOTA: r.NUNOTA != null && Number.isFinite(Number(r.NUNOTA)) ? Number(r.NUNOTA) : null,
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
          VLRJURO: parseDecimal(r.VLRJURO),
          VLRMULTA: parseDecimal(r.VLRMULTA),
          VLRDESC: parseDecimal(r.VLRDESC),
          HISTORICO: texto(r.HISTORICO),
          RATEADO: texto(r.RATEADO),
          NUMNOTA: r.NUMNOTA != null && Number.isFinite(Number(r.NUMNOTA)) ? Number(r.NUMNOTA) : null,
          SERIENOTA: texto(r.SERIENOTA),
          valor_aberto: valorAberto,
          is_em_aberto: isEmAberto ? 1 : 0,
          synced_at: now,
        });
        inserted += 1;
      }

      if (inserted === 0) return { removidos: 0, ignorada: null };

      const totalJanela = (contarJanela.get(DATA_INICIO_ISO) as { total: number }).total;
      const orfaos = (contarOrfaos.get(DATA_INICIO_ISO) as { total: number }).total;
      const limite = Math.max(LIMITE_REMOCAO_MIN, Math.floor(totalJanela * LIMITE_REMOCAO_PCT));

      if (orfaos > limite) return { removidos: 0, ignorada: { orfaos, limite } };
      if (orfaos === 0) return { removidos: 0, ignorada: null };

      removerOrfaos.run(DATA_INICIO_ISO);
      return { removidos: orfaos, ignorada: null };
    });
    const limpeza = tx();

    if (limpeza.ignorada) {
      logger.warn(limpeza.ignorada, "remocao de titulos orfaos ignorada: volume acima do limite de seguranca");
    } else if (limpeza.removidos > 0) {
      logger.info({ removidos: limpeza.removidos }, "titulos removidos: nao existem mais no Sankhya");
    }
    recordSyncSuccess({ entity: "titulos", rowCount: inserted, fullSync: true });
  } catch (err) {
    recordSyncError("titulos", err);
    throw err;
  }
}
