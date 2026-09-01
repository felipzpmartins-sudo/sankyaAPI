import { getDb } from "../db/connection.js";
import { countRows, executeQueryByCursor } from "../sankhya/query.js";
import type { DecodedEntity } from "../sankhya/types.js";
import { parseDateBR } from "../utils/dates.js";
import { parseDecimal, parseIntOrNull } from "../utils/numbers.js";
import { FATURAMENTO_TOPS } from "../services/operacoes.js";
import pino from "pino";
import { config } from "../config.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const logger = pino({ level: config.LOG_LEVEL, transport: { target: "pino-pretty", options: { colorize: true } } });

/**
 * Colunas lidas da TGFCAB. Todas conferidas em ALL_TAB_COLUMNS — a versao
 * anterior ia pela entidade CabecalhoNota do CRUD e mantinha um conjunto
 * reduzido de reserva porque campo invalido derrubava a carga inteira.
 *
 * As datas passam por TO_CHAR: em SQL cru o Sankhya devolve
 * `"31082026 00:00:00"`, que parseDateBR nao reconhece.
 */
const COLUNAS = [
  "NUNOTA",
  "CODEMP",
  "CODPARC",
  "CODVEND",
  "CODTIPOPER",
  "CODCENCUS",
  "CODPROJ",
  "CODPARCTRANSP",
  "NUMNOTA",
  "SERIENOTA",
  "TO_CHAR(DTNEG, 'DD/MM/YYYY') AS DTNEG",
  "TO_CHAR(DTFATUR, 'DD/MM/YYYY') AS DTFATUR",
  "TO_CHAR(DTENTSAI, 'DD/MM/YYYY') AS DTENTSAI",
  "CIF_FOB",
  "QTDVOL",
  "STATUSNOTA",
  "VLRNOTA",
  "VLRFRETE",
].join(", ");

const DATA_INICIO = "01/01/2025";
/** Mesma janela de DATA_INICIO, no formato em que DTNEG e gravado no SQLite. */
const DATA_INICIO_ISO = "2025-01-01";

const ORIGEM = "TGFCAB";
const ORIGEM_EXC = "TGFCAB_EXC";
const FILTRO = `DTNEG >= TO_DATE('${DATA_INICIO}','DD/MM/YYYY')`;
const FILTRO_EXC = `${FILTRO} AND CODTIPOPER IN (${FATURAMENTO_TOPS.join(", ")})`;

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

type Leitura<T> = { rows: T[]; completo: boolean };

/**
 * Conta antes de varrer e devolve se a leitura veio inteira. Sem essa
 * referencia nao ha como distinguir nota excluida no ERP de linha que a
 * varredura perdeu — e a limpeza de orfaos apaga as duas.
 */
async function loadPedidosSankhya(): Promise<Leitura<DecodedEntity>> {
  const esperado = await countRows(ORIGEM, FILTRO);
  const rows = await executeQueryByCursor({
    select: COLUNAS,
    from: ORIGEM,
    where: FILTRO,
    key: "NUNOTA",
  });
  return { rows, completo: rows.length === esperado };
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

async function loadPedidosCancelados(): Promise<Leitura<PedidoCancelado>> {
  const esperado = await countRows(ORIGEM_EXC, FILTRO_EXC);
  const brutos = await executeQueryByCursor({
    select:
      "NUNOTA, CODEMP, CODPARC, CODVEND, CODTIPOPER, CODPROJ, " +
      "TO_CHAR(DTNEG, 'DD/MM/YYYY') AS DTNEG, VLRNOTA",
    from: ORIGEM_EXC,
    where: FILTRO_EXC,
    key: "NUNOTA",
  });

  const rows = brutos
    .map((row) => ({
      NUNOTA: Number(row.NUNOTA),
      CODEMP: Number(row.CODEMP),
      CODPARC: Number(row.CODPARC),
      CODVEND: parseIntOrNull(row.CODVEND),
      CODTIPOPER: Number(row.CODTIPOPER),
      CODPROJ: parseIntOrNull(row.CODPROJ),
      DTNEG: parseDateBR(row.DTNEG),
      VLRNOTA: parseDecimal(row.VLRNOTA),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.NUNOTA) &&
        Number.isFinite(row.CODEMP) &&
        Number.isFinite(row.CODPARC) &&
        Number.isFinite(row.CODTIPOPER) &&
        row.DTNEG,
    );

  return { rows, completo: brutos.length === esperado };
}

export async function syncPedidos(): Promise<void> {
  try {
    const tipmovMap = buildTipmovMap();
    if (tipmovMap.size === 0) {
      throw new Error(
        "tipos_operacao vazio — rodar syncTiposOperacao antes de syncPedidos",
      );
    }

    const [ativos, excluidos] = await Promise.all([
      loadPedidosSankhya(),
      loadPedidosCancelados(),
    ]);
    const rows = ativos.rows;
    const cancelados = excluidos.rows;
    const leituraCompleta = ativos.completo && excluidos.completo;
    if (!leituraCompleta) {
      logger.warn(
        { tgfcab: ativos.completo, tgfcabExc: excluidos.completo },
        "leitura de pedidos incompleta: limpeza de orfaos suspensa neste ciclo",
      );
    }

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
    // A remocao de orfaos usa o proprio carimbo do ciclo em vez de uma tabela
    // temporaria de NUFIN vistos. Toda linha que a resposta trouxe recebe
    // synced_at = @carimbo no upsert; o que sobrar na janela com carimbo
    // anterior nao veio na resposta e portanto nao existe mais no Sankhya.
    //
    // A versao com tabela temporaria apagou 548 titulos legitimos em
    // producao: o teste de pertinencia dependia de a chave gravada no
    // temporario casar exatamente com a da tabela, e bastava uma divergencia
    // de tipo para a linha ser considerada ausente. Comparar carimbo nao tem
    // esse modo de falha e ainda se auto-corrige, porque o proximo ciclo
    // completo regrava o carimbo de todas as linhas.
    const filtroJanela = "DTNEG >= @janela AND synced_at < @carimbo";
    const contarOrfaos = db.prepare(`SELECT COUNT(*) AS total FROM pedidos WHERE ${filtroJanela}`);
    const removerOrfaos = db.prepare(`DELETE FROM pedidos WHERE ${filtroJanela}`);
    const contarJanela = db.prepare("SELECT COUNT(*) AS total FROM pedidos WHERE DTNEG >= @janela");

    type ResultadoLimpeza = {
      removidos: number;
      ignorada: { orfaos: number; limite: number } | null;
    };

    let inserted = 0;
    const tx = db.transaction((): ResultadoLimpeza => {
      for (const r of rows) {
        const nunota = Number(r.NUNOTA);
        const codtipoper = Number(r.CODTIPOPER);
        if (!Number.isFinite(nunota) || !Number.isFinite(codtipoper)) continue;
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
            codparctransp != null ? nomeParceiro.get(codparctransp) ?? null : null,
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
      // Leitura parcial nao autoriza apagar nada: o que faltou na resposta e
      // indistinguivel do que foi excluido no ERP.
      if (!leituraCompleta) return { removidos: 0, ignorada: null };

      const alvo = { janela: DATA_INICIO_ISO, carimbo: now };
      const totalJanela = (contarJanela.get(alvo) as { total: number }).total;
      const orfaos = (contarOrfaos.get(alvo) as { total: number }).total;
      const limite = Math.max(LIMITE_REMOCAO_MIN, Math.floor(totalJanela * LIMITE_REMOCAO_PCT));

      if (orfaos > limite) return { removidos: 0, ignorada: { orfaos, limite } };
      if (orfaos === 0) return { removidos: 0, ignorada: null };

      removerOrfaos.run(alvo);
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
