import { getDb } from "../db/connection.js";
import { countRows, executeQueryByCursor } from "../sankhya/query.js";
import { parseDateBR } from "../utils/dates.js";
import { parseDecimal } from "../utils/numbers.js";
import pino from "pino";
import { config } from "../config.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

const logger = pino({ level: config.LOG_LEVEL, transport: { target: "pino-pretty", options: { colorize: true } } });

/**
 * Colunas lidas da TGFFIN, no formato que DbExplorerSP.executeQuery devolve.
 *
 * As datas passam por TO_CHAR porque em SQL cru o Sankhya devolve
 * `"31082026 00:00:00"` (sem barras), que parseDateBR nao reconhece.
 *
 * DHCONCIL saiu do conjunto: nao existe como coluna em nenhuma tabela do
 * banco — e campo calculado da entidade Financeiro do CRUD —, e nenhuma
 * consulta do backend ou do frontend le esse campo. A coluna permanece no
 * schema, sem escrita.
 */
const COLUNAS = [
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
  "TO_CHAR(DTNEG, 'DD/MM/YYYY') AS DTNEG",
  "TO_CHAR(DTVENC, 'DD/MM/YYYY') AS DTVENC",
  "TO_CHAR(DHBAIXA, 'DD/MM/YYYY') AS DHBAIXA",
  "TO_CHAR(DTCONTAB, 'DD/MM/YYYY') AS DTCONTAB",
  "VLRDESDOB",
  "VLRBAIXA",
  // Composicao do valor: sem estes campos nao da para dizer se o valor do
  // titulo embute juros, multa ou desconto.
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
].join(", ");

/**
 * Janela inicial reduzida para o ano atual, suficiente para a tela 14.2
 * (DRE, fluxo de caixa do "ano"). Para DRE comparativo e fluxo de caixa
 * 12m rolantes, ampliar para 2025-01-01 numa próxima iteração — o primeiro
 * sync dessa janela maior leva ~10min (volume da TGFFIN).
 */
const DATA_INICIO = "01/01/2025";
/** Mesma janela de DATA_INICIO, no formato em que DTNEG e gravado no SQLite. */
const DATA_INICIO_ISO = "2025-01-01";

const ORIGEM = "TGFFIN";
const FILTRO = `DTNEG >= TO_DATE('${DATA_INICIO}','DD/MM/YYYY')`;

/**
 * Teto de seguranca para a remocao de orfaos, segunda linha de defesa atras
 * da conferencia de contagem: mesmo com a leitura batendo com o COUNT(*) do
 * ERP, uma exclusao em massa inesperada fica registrada em vez de aplicada.
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
    // Conta antes de varrer: e a referencia para saber se a leitura veio
    // inteira. Sem ela nao ha como distinguir "titulo apagado no ERP" de
    // "linha que a varredura perdeu", e a limpeza de orfaos apaga as duas.
    const esperado = await countRows(ORIGEM, FILTRO);
    const rows = await executeQueryByCursor({
      select: COLUNAS,
      from: ORIGEM,
      where: FILTRO,
      key: "NUFIN",
    });
    const leituraCompleta = rows.length === esperado;
    if (!leituraCompleta) {
      logger.warn(
        { esperado, lidos: rows.length },
        "leitura de titulos incompleta: limpeza de orfaos suspensa neste ciclo",
      );
    }

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
          DTNEG, DTVENC, DHBAIXA, DTCONTAB,
            VLRDESDOB, VLRBAIXA, VLRJURO, VLRMULTA, VLRDESC,
            HISTORICO, RATEADO, NUMNOTA, SERIENOTA,
            valor_aberto, is_em_aberto, synced_at)
       VALUES
          (@NUFIN, @NUNOTA, @CODEMP, @CODPARC, @CODCENCUS, @CODPROJ, @CODTIPTIT, @CODNAT, @RECDESP, @PROVISAO, @tipo,
          @DTNEG, @DTVENC, @DHBAIXA, @DTCONTAB,
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
    const contarOrfaos = db.prepare(`SELECT COUNT(*) AS total FROM titulos WHERE ${filtroJanela}`);
    const removerOrfaos = db.prepare(`DELETE FROM titulos WHERE ${filtroJanela}`);
    const contarJanela = db.prepare("SELECT COUNT(*) AS total FROM titulos WHERE DTNEG >= @janela");

    type ResultadoLimpeza = {
      removidos: number;
      ignorada: { orfaos: number; limite: number } | null;
    };

    let inserted = 0;
    const tx = db.transaction((): ResultadoLimpeza => {
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
