import { getDb } from "../db/connection.js";
import { countRows, executeQueryByCursor } from "../sankhya/query.js";
import { parseIntOrNull } from "../utils/numbers.js";
import { recordSyncError, recordSyncSuccess } from "./state.js";

/**
 * Vínculo pedido -> nota fiscal.
 *
 * Na TGFCAB o pedido de venda (TIPMOV 'P') e a nota emitida (TIPMOV 'V') são
 * registros distintos. A TGFVAR é quem liga os dois: NUNOTAORIG aponta para o
 * pedido, NUNOTA para a nota. Ela tem uma linha por item atendido, então o
 * mesmo par aparece repetido — a deduplicação acontece aqui.
 *
 * Sem isso não existe a resposta para "quais pedidos ainda não viraram nota",
 * que é o relatório pedido pelo comercial.
 */

const ORIGEM = "TGFVAR v INNER JOIN TGFCAB p ON p.NUNOTA = v.NUNOTAORIG";
const DATA_INICIO = "01/01/2025";
/** Mesma janela do sync de pedidos: vínculo de pedido que não temos é inútil. */
const FILTRO = `p.DTNEG >= TO_DATE('${DATA_INICIO}','DD/MM/YYYY')`;

export async function syncVinculos(): Promise<void> {
  try {
    const esperado = await countRows(ORIGEM, FILTRO);
    const rows = await executeQueryByCursor({
      select: "v.NUNOTAORIG, v.NUNOTA",
      from: ORIGEM,
      where: FILTRO,
      // NUNOTAORIG repete (uma linha por item do pedido), então a paginação
      // precisa descartar o último grupo da página cheia e retomar nele.
      key: "v.NUNOTAORIG",
      keyRepeats: true,
    });

    if (rows.length !== esperado) {
      throw new Error(
        `leitura de vinculos incompleta: ${rows.length} de ${esperado} no Sankhya`,
      );
    }

    // Um par por vínculo. A TGFVAR repete o par a cada item atendido.
    const pares = new Map<string, { pedido: number; nota: number }>();
    for (const row of rows) {
      const record = row as Record<string, unknown>;
      const pedido = parseIntOrNull(record.NUNOTAORIG == null ? null : String(record.NUNOTAORIG));
      const nota = parseIntOrNull(record.NUNOTA == null ? null : String(record.NUNOTA));
      if (pedido == null || nota == null) continue;
      pares.set(`${pedido}:${nota}`, { pedido, nota });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT OR REPLACE INTO pedido_nota (NUNOTA_PEDIDO, NUNOTA_NOTA, synced_at)
       VALUES (?, ?, ?)`,
    );

    let inserted = 0;
    const tx = db.transaction(() => {
      // Substituição completa: a leitura só chega aqui se veio inteira, e um
      // vínculo desfeito no ERP precisa sumir daqui também.
      db.prepare("DELETE FROM pedido_nota").run();
      for (const par of pares.values()) {
        insert.run(par.pedido, par.nota, now);
        inserted += 1;
      }
    });
    tx();

    recordSyncSuccess({ entity: "vinculos", rowCount: inserted, fullSync: true });
  } catch (err) {
    recordSyncError("vinculos", err);
    throw err;
  }
}
