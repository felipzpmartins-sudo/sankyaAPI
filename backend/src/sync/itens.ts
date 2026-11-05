import { getDb } from "../db/connection.js";
import { countRows, executeQueryByCursor } from "../sankhya/query.js";
import { parseIntOrNull } from "../utils/numbers.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

/**
 * Itens de nota (TGFITE).
 *
 * A tabela `pedido_itens` existia no schema desde o começo mas nunca foi
 * preenchida: nenhum sync escrevia nela. Por isso o resumo de "últimas notas"
 * sempre mostrava a lista de produtos vazia, e por isso curva ABC, ranking de
 * produtos e "quem mais vende o quê" não tinham de onde sair.
 */

const ORIGEM = "TGFITE i INNER JOIN TGFCAB c ON c.NUNOTA = i.NUNOTA";
const DATA_INICIO = "01/01/2025";
/** Mesma janela do sync de pedidos: item de nota que não temos não serve. */
const FILTRO = `c.DTNEG >= TO_DATE('${DATA_INICIO}','DD/MM/YYYY')`;

const COLUNAS = [
  "i.NUNOTA",
  "i.SEQUENCIA",
  "i.CODPROD",
  "i.QTDNEG",
  "i.VLRUNIT",
  "i.VLRTOT",
  "i.VLRDESC",
  "i.CODLOCALORIG",
  // Nota de kit traz o conjunto E os componentes desmembrados (USOPROD 'D'),
  // e a soma dos componentes repete o valor do conjunto. Sem esta coluna a
  // tela de produtos contava o kit duas vezes.
  "i.USOPROD",
].join(", ");

function decimal(value: unknown): number {
  if (value == null) return 0;
  const texto = String(value).trim().replace(",", ".");
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

export async function syncItens(): Promise<void> {
  try {
    const esperado = await countRows(ORIGEM, FILTRO);
    const rows = await executeQueryByCursor({
      select: COLUNAS,
      from: ORIGEM,
      where: FILTRO,
      // Uma nota tem vários itens, então a chave repete: a paginação descarta
      // o último grupo da página cheia e retoma nele.
      key: "i.NUNOTA",
      keyRepeats: true,
    });

    const leituraCompleta = rows.length === esperado;

    const db = getDb();
    const now = new Date().toISOString();
    const upsert = db.prepare(
      `INSERT INTO pedido_itens
         (NUNOTA, SEQUENCIA, CODPROD, QTDNEG, VLRUNIT, VLRTOT, VLRDESC, CODLOCALORIG, USOPROD, synced_at)
       VALUES
         (@NUNOTA, @SEQUENCIA, @CODPROD, @QTDNEG, @VLRUNIT, @VLRTOT, @VLRDESC, @CODLOCALORIG, @USOPROD, @synced_at)
       ON CONFLICT(NUNOTA, SEQUENCIA) DO UPDATE SET
         CODPROD      = excluded.CODPROD,
         QTDNEG       = excluded.QTDNEG,
         VLRUNIT      = excluded.VLRUNIT,
         VLRTOT       = excluded.VLRTOT,
         VLRDESC      = excluded.VLRDESC,
         CODLOCALORIG = excluded.CODLOCALORIG,
         USOPROD      = excluded.USOPROD,
         synced_at    = excluded.synced_at`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const row of rows) {
        const record = row as Record<string, unknown>;
        const nunota = parseIntOrNull(record.NUNOTA == null ? null : String(record.NUNOTA));
        const sequencia = parseIntOrNull(record.SEQUENCIA == null ? null : String(record.SEQUENCIA));
        const codprod = parseIntOrNull(record.CODPROD == null ? null : String(record.CODPROD));
        if (nunota == null || sequencia == null || codprod == null) continue;

        upsert.run({
          NUNOTA: nunota,
          SEQUENCIA: sequencia,
          CODPROD: codprod,
          QTDNEG: decimal(record.QTDNEG),
          VLRUNIT: decimal(record.VLRUNIT),
          VLRTOT: decimal(record.VLRTOT),
          VLRDESC: decimal(record.VLRDESC),
          CODLOCALORIG: parseIntOrNull(
            record.CODLOCALORIG == null ? null : String(record.CODLOCALORIG),
          ),
          USOPROD: record.USOPROD == null ? null : String(record.USOPROD).trim() || null,
          synced_at: now,
        });
        inserted += 1;
      }

      // Leitura parcial não autoriza apagar: o que faltou na resposta é
      // indistinguível do que foi excluído no ERP. Mesma regra de titulos.
      if (!leituraCompleta || inserted === 0) return;

      db.prepare(
        `DELETE FROM pedido_itens
         WHERE synced_at < ?
           AND NUNOTA IN (SELECT NUNOTA FROM pedidos WHERE DTNEG >= '2025-01-01')`,
      ).run(now);
    });
    tx();

    if (!leituraCompleta) {
      throw new Error(
        `leitura de itens incompleta: ${rows.length} de ${esperado} no Sankhya`,
      );
    }

    recordSyncSuccess({ entity: "itens", rowCount: inserted, fullSync: true });
  } catch (err) {
    recordSyncError("itens", err);
    throw err;
  }
}
