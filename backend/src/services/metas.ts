import { getDb } from "../db/connection.js";
import { config } from "../config.js";

/**
 * Metas mensais de venda por vendedor, digitadas no painel.
 *
 * O Sankhya tem o modulo de metas instalado, mas as tabelas de valor estao
 * vazias — por isso a meta mora no snapshot (tabela `metas_vendedor`). O sync
 * nunca toca nessa tabela: apagar e recriar o snapshot apaga as metas junto,
 * entao o volume do Railway precisa continuar persistente.
 *
 * A meta e sempre de um mes inteiro e vale para o vendedor em todas as
 * empresas — o filtro de empresa recorta a venda, nao a meta.
 */

export type MetaVendedor = {
  CODVEND: number;
  vendedor: string;
  ativo: boolean;
  valor: number | null;
  alterado_por: string | null;
  alterado_em: string | null;
};

function normalizar(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Quem pode gravar meta. Com METAS_EDITORES vazio qualquer conta logada grava;
 * preenchido, so os e-mails da lista.
 */
export function podeEditarMetas(email: string | null | undefined): boolean {
  const lista = (config.METAS_EDITORES ?? "")
    .split(",")
    .map(normalizar)
    .filter(Boolean);
  if (lista.length === 0) return Boolean(normalizar(email));
  return lista.includes(normalizar(email));
}

/**
 * Metas de um mes, com todos os vendedores ativos — os sem meta vem com
 * `valor: null`, para a tela ja montar o formulario completo. Vendedor inativo
 * so aparece se ainda tiver meta gravada naquele mes.
 */
export function listarMetas(anoMes: string): { ano_mes: string; vendedores: MetaVendedor[] } {
  const linhas = getDb()
    .prepare(
      `SELECT v.CODVEND, v.APELIDO AS vendedor, v.ativo,
              m.valor, m.alterado_por, m.alterado_em
         FROM vendedores v
         LEFT JOIN metas_vendedor m ON m.CODVEND = v.CODVEND AND m.ano_mes = ?
        WHERE v.ativo = 1 OR m.valor IS NOT NULL
        ORDER BY (m.valor IS NULL), v.APELIDO COLLATE NOCASE`,
    )
    .all(anoMes) as Array<Omit<MetaVendedor, "ativo"> & { ativo: number }>;

  return {
    ano_mes: anoMes,
    vendedores: linhas.map((r) => ({ ...r, ativo: r.ativo === 1 })),
  };
}

/**
 * Grava as metas de um mes. Valor nulo ou zero apaga a meta daquele vendedor.
 * Tudo numa transacao so: ou o formulario inteiro entra, ou nada muda.
 */
export function gravarMetas(
  anoMes: string,
  metas: Array<{ CODVEND: number; valor: number | null }>,
  email: string | null,
): { gravadas: number; removidas: number } {
  const db = getDb();
  const agora = new Date().toISOString();
  const upsert = db.prepare(
    `INSERT INTO metas_vendedor (CODVEND, ano_mes, valor, alterado_por, alterado_em)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (CODVEND, ano_mes) DO UPDATE SET
       valor = excluded.valor,
       alterado_por = excluded.alterado_por,
       alterado_em = excluded.alterado_em
     WHERE metas_vendedor.valor <> excluded.valor`,
  );
  const remover = db.prepare("DELETE FROM metas_vendedor WHERE CODVEND = ? AND ano_mes = ?");

  let gravadas = 0;
  let removidas = 0;
  db.transaction(() => {
    for (const meta of metas) {
      if (meta.valor == null || meta.valor <= 0) {
        removidas += remover.run(meta.CODVEND, anoMes).changes;
      } else {
        gravadas += upsert.run(
          meta.CODVEND,
          anoMes,
          Math.round(meta.valor * 100) / 100,
          normalizar(email) || null,
          agora,
        ).changes;
      }
    }
  })();

  return { gravadas, removidas };
}

/** Metas dos meses pedidos, indexadas por vendedor e depois por mes. */
export function metasDosMeses(meses: string[]): Map<number, Map<string, number>> {
  const porVendedor = new Map<number, Map<string, number>>();
  if (meses.length === 0) return porVendedor;

  const linhas = getDb()
    .prepare(
      `SELECT CODVEND, ano_mes, valor FROM metas_vendedor
        WHERE ano_mes IN (${meses.map(() => "?").join(", ")})`,
    )
    .all(...meses) as Array<{ CODVEND: number; ano_mes: string; valor: number }>;

  for (const r of linhas) {
    const doVendedor = porVendedor.get(r.CODVEND) ?? new Map<string, number>();
    doVendedor.set(r.ano_mes, r.valor);
    porVendedor.set(r.CODVEND, doVendedor);
  }
  return porVendedor;
}
