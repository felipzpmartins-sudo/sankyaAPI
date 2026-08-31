import { getDb } from "../db/connection.js";
import { loadAllRecords } from "../sankhya/crud.js";
import { executeQuery } from "../sankhya/query.js";
import { parseDateBR } from "../utils/dates.js";
import { parseDecimal, parseIntOrNull } from "../utils/numbers.js";
import { FATURAMENTO_TOPS } from "../services/operacoes.js";
import pino from "pino";
import { config } from "../config.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const logger = pino({ level: config.LOG_LEVEL, transport: { target: "pino-pretty", options: { colorize: true } } });

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
const FIELDS_BASE = [
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

const FIELDS = [
  ...FIELDS_BASE.slice(0, 5),
  "CODCENCUS",
  "CODPROJ",
  "CODPARCTRANSP",
  ...FIELDS_BASE.slice(5, 9),
  "DTENTSAI",
  "CIF_FOB",
  "QTDVOL",
  ...FIELDS_BASE.slice(9),
];

const DATA_INICIO = "01/01/2025";
/** Mesma janela de DATA_INICIO, no formato em que DTNEG e gravado no SQLite. */
const DATA_INICIO_ISO = "2025-01-01";

/** Ver nota equivalente em sync/titulos.ts. */
const LIMITE_REMOCAO_PCT = 0.05;
const LIMITE_REMOCAO_MIN = 100;

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

async function loadPedidosSankhya() {
  const args = {
    rootEntity: "CabecalhoNota",
    expression: `this.DTNEG >= TO_DATE('${DATA_INICIO}','DD/MM/YYYY')`,
  };

  try {
    return await loadAllRecords({ ...args, fields: FIELDS });
  } catch {
    return loadAllRecords({ ...args, fields: FIELDS_BASE });
  }
}

type PedidoCancelado = {
  NUNOTA: number;
  CODEMP: number;
  CODPARC: number;
  CODVEND: number | null;
  CODTIPOPER: number;
  CODPROJ: number | null;
  DTNEG: string | null;
  VLRNOTA: number;
};

async function loadPedidosCancelados(): Promise<PedidoCancelado[]> {
  const result = await executeQuery(`
    SELECT NUNOTA, CODEMP, CODPARC, CODVEND, CODTIPOPER, CODPROJ,
           TO_CHAR(DTNEG, 'DD/MM/YYYY') AS DTNEG, VLRNOTA
    FROM TGFCAB_EXC
    WHERE DTNEG >= TO_DATE('${DATA_INICIO}', 'DD/MM/YYYY')
      AND CODTIPOPER IN (${FATURAMENTO_TOPS.join(", ")})
  `);
  const fieldIndex = new Map(result.fields.map((field, index) => [field, index]));
  const value = (row: unknown[], field: string) => row[fieldIndex.get(field) ?? -1];

  return result.rows
    .map((row) => ({
      NUNOTA: Number(value(row, "NUNOTA")),
      CODEMP: Number(value(row, "CODEMP")),
      CODPARC: Number(value(row, "CODPARC")),
      CODVEND: parseIntOrNull(String(value(row, "CODVEND") ?? "")),
      CODTIPOPER: Number(value(row, "CODTIPOPER")),
      CODPROJ: parseIntOrNull(String(value(row, "CODPROJ") ?? "")),
      DTNEG: parseDateBR(String(value(row, "DTNEG") ?? "")),
      VLRNOTA: parseDecimal(String(value(row, "VLRNOTA") ?? "")),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.NUNOTA) &&
        Number.isFinite(row.CODEMP) &&
        Number.isFinite(row.CODPARC) &&
        Number.isFinite(row.CODTIPOPER) &&
        row.DTNEG,
    );
}

export async function syncPedidos(): Promise<void> {
  try {
    const tipmovMap = buildTipmovMap();
    if (tipmovMap.size === 0) {
      throw new Error(
        "tipos_operacao vazio — rodar syncTiposOperacao antes de syncPedidos",
      );
    }

    const [rows, cancelados] = await Promise.all([
      loadPedidosSankhya(),
      loadPedidosCancelados(),
    ]);

    const db = getDb();
    const now = new Date().toISOString();

    const upsert = db.prepare(
       `INSERT INTO pedidos
         (NUNOTA, CODEMP, CODPARC, CODVEND, CODTIPOPER, TIPMOV,
          CODPARCTRANSP, TRANSPORTADORA_NOME, NUMNOTA, SERIENOTA,
           DTNEG, DTFATUR, DTENTSAI, CIF_FOB, QTDVOL, STATUSNOTA,
           CODCENCUS, CODPROJ,
          VLRNOTA, VLRDESC, VLRFRETE, AD_OBS, synced_at)
       VALUES
         (@NUNOTA, @CODEMP, @CODPARC, @CODVEND, @CODTIPOPER, @TIPMOV,
          @CODPARCTRANSP, @TRANSPORTADORA_NOME, @NUMNOTA, @SERIENOTA,
          @DTNEG, @DTFATUR, @DTENTSAI, @CIF_FOB, @QTDVOL, @STATUSNOTA,
          @CODCENCUS, @CODPROJ,
          @VLRNOTA, @VLRDESC, @VLRFRETE, @AD_OBS, @synced_at)
       ON CONFLICT(NUNOTA) DO UPDATE SET
         CODEMP     = excluded.CODEMP,
         CODPARC    = excluded.CODPARC,
         CODVEND    = excluded.CODVEND,
         CODTIPOPER = excluded.CODTIPOPER,
         TIPMOV     = excluded.TIPMOV,
         CODPARCTRANSP = excluded.CODPARCTRANSP,
         TRANSPORTADORA_NOME = excluded.TRANSPORTADORA_NOME,
         CODCENCUS = excluded.CODCENCUS,
         CODPROJ = excluded.CODPROJ,
         NUMNOTA    = excluded.NUMNOTA,
         SERIENOTA  = excluded.SERIENOTA,
         DTNEG      = excluded.DTNEG,
         DTFATUR    = excluded.DTFATUR,
         DTENTSAI   = excluded.DTENTSAI,
         CIF_FOB    = excluded.CIF_FOB,
         QTDVOL     = excluded.QTDVOL,
         STATUSNOTA = excluded.STATUSNOTA,
         VLRNOTA    = excluded.VLRNOTA,
         VLRDESC    = excluded.VLRDESC,
         VLRFRETE   = excluded.VLRFRETE,
         AD_OBS     = excluded.AD_OBS,
         synced_at  = excluded.synced_at`,
    );

    // CODPARCTRANSP e sincronizado, mas o campo de apresentacao com o nome
    // nunca vem na resposta — TRANSPORTADORA_NOME ficava 100% NULL e o painel
    // de entregas agrupava tudo em "Sem transportadora". Resolvido localmente.
    const nomeParceiro = new Map<number, string>(
      (db.prepare("SELECT CODPARC, NOMEPARC FROM parceiros").all() as {
        CODPARC: number;
        NOMEPARC: string;
      }[]).map((parceiro) => [parceiro.CODPARC, parceiro.NOMEPARC]),
    );

    const empresasConhecidas = new Set<number>(
      (db.prepare("SELECT CODEMP FROM empresas").all() as { CODEMP: number }[]).map(
        (r) => r.CODEMP,
      ),
    );

    // Sem isto o sync so faz upsert e pedido excluido no Sankhya nunca sai do
    // snapshot, inflando faturamento. "Visto" e a uniao de TGFCAB (ativos) com
    // TGFCAB_EXC (cancelados), que ja sao carregados acima.
    db.exec("CREATE TEMP TABLE IF NOT EXISTS _pedidos_vistos (NUNOTA INTEGER PRIMARY KEY)");
    const marcarVisto = db.prepare("INSERT OR IGNORE INTO _pedidos_vistos (NUNOTA) VALUES (?)");
    const filtroJanela = "DTNEG >= ? AND NUNOTA NOT IN (SELECT NUNOTA FROM _pedidos_vistos)";
    const contarOrfaos = db.prepare(`SELECT COUNT(*) AS total FROM pedidos WHERE ${filtroJanela}`);
    const removerOrfaos = db.prepare(`DELETE FROM pedidos WHERE ${filtroJanela}`);
    const contarJanela = db.prepare("SELECT COUNT(*) AS total FROM pedidos WHERE DTNEG >= ?");

    type ResultadoLimpeza = {
      removidos: number;
      ignorada: { orfaos: number; limite: number } | null;
    };

    let inserted = 0;
    const tx = db.transaction((): ResultadoLimpeza => {
      db.prepare("DELETE FROM _pedidos_vistos").run();
      for (const r of rows) {
        const nunota = Number(r.NUNOTA);
        const codtipoper = Number(r.CODTIPOPER);
        if (!Number.isFinite(nunota) || !Number.isFinite(codtipoper)) continue;

        marcarVisto.run(nunota);

        const codemp = Number(r.CODEMP);
        const codparctransp = parseIntOrNull(r.CODPARCTRANSP);
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
          CODPARCTRANSP: codparctransp,
          TRANSPORTADORA_NOME:
            r.ParceiroTransportadora_NOMEPARC ??
            (codparctransp != null ? nomeParceiro.get(codparctransp) ?? null : null),
          NUMNOTA: parseIntOrNull(r.NUMNOTA),
          SERIENOTA: r.SERIENOTA ?? null,
          DTNEG: parseDateBR(r.DTNEG),
          DTFATUR: parseDateBR(r.DTFATUR),
          DTENTSAI: parseDateBR(r.DTENTSAI),
          CIF_FOB: r.CIF_FOB ?? null,
          QTDVOL: parseDecimal(r.QTDVOL),
            CODCENCUS: parseIntOrNull(r.CODCENCUS),
            CODPROJ: parseIntOrNull(r.CODPROJ),
          STATUSNOTA: r.STATUSNOTA ?? null,
          VLRNOTA: parseDecimal(r.VLRNOTA),
          VLRDESC: 0,
          VLRFRETE: parseDecimal(r.VLRFRETE),
          AD_OBS: null,
          synced_at: now,
        });
        inserted += 1;
      }

      for (const r of cancelados) {
        marcarVisto.run(r.NUNOTA);
        if (!empresasConhecidas.has(r.CODEMP)) {
          upsertEmpresaStub(r.CODEMP);
          empresasConhecidas.add(r.CODEMP);
        }

        upsert.run({
          NUNOTA: r.NUNOTA,
          CODEMP: r.CODEMP,
          CODPARC: r.CODPARC,
          CODVEND: r.CODVEND,
          CODTIPOPER: r.CODTIPOPER,
          TIPMOV: tipmovMap.get(r.CODTIPOPER) ?? "V",
          CODPARCTRANSP: null,
          TRANSPORTADORA_NOME: null,
          NUMNOTA: null,
          SERIENOTA: null,
          DTNEG: r.DTNEG,
          DTFATUR: null,
          DTENTSAI: null,
          CIF_FOB: null,
          QTDVOL: 0,
          STATUSNOTA: "C",
          CODCENCUS: null,
          CODPROJ: r.CODPROJ,
          VLRNOTA: r.VLRNOTA,
          VLRDESC: 0,
          VLRFRETE: 0,
          AD_OBS: "Pedido cancelado no Sankhya",
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
      logger.warn(limpeza.ignorada, "remocao de pedidos orfaos ignorada: volume acima do limite de seguranca");
    } else if (limpeza.removidos > 0) {
      logger.info({ removidos: limpeza.removidos }, "pedidos removidos: nao existem mais no Sankhya");
    }

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
