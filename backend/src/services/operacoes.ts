/**
 * Mapeamento de CODTIPOPER (TGFTOP) em categorias de negócio.
 *
 * O Sankhya marca todas as saídas como TIPMOV='V', mas o critério de
 * "faturamento real" da Maker exclui remessas, bonificações, ajustes e
 * outras movimentações que não geram receita. Listas mantidas em código
 * (revisar com financeiro periodicamente).
 *
 * Decisão de produto (2026-05-15): FATURAMENTO_ARMAZENAGEM (1760) fica
 * de fora; comodato vira métrica própria.
 */

/** Whitelist de TOPs que contam como FATURAMENTO REAL (receita). */
export const FATURAMENTO_TOPS = [
  1100, // NFE VENDA
  1107, // FATURAMENTO CONSIGNAÇÃO - VENDA
  1111, // VENDA - ENTREGA FUTURA
  1716, // NFS-E EMISSÃO PREFEITURA C/RETENCAO
  1733, // NFE VENDA - SC
  1763, // NFE VENDA KIT
  1776, // NFE VENDA - ES
  1795, // NFE VENDA - GERENCIAL
  1797, // NFE VENDA - KIT LIVRO E APOSTILA
  1801, // NFE VENDA - KIT LIVRO E APOSTILA SC
  1802, // NFE VENDA - KIT LIVRO E APOSTILA ES
  1705, // VENDA NF-E EXPORT
  1766, // VENDA NF-E EXPORT CFOP 6502
  1769, // NF-E EXPORT
  1770, // VENDA NF-E EXTERIOR
] as const;

/** TOPs de saída em comodato (escola recebe o kit). */
export const COMODATO_SAIDA_TOPS = [
  1109, // NFE REMESSA EM COMODATO
  1772, // NFE REMESSA EM COMODATO EXTERIOR
] as const;

/** TOPs de retorno de comodato (kit volta pra Maker). */
export const COMODATO_RETORNO_TOPS = [
  1203, // NFE RETORNO COMODATO
] as const;

/** Monta cláusula SQL "X IN (a, b, c)" a partir de uma lista. */
export function inListClause(coluna: string, ids: readonly number[]): string {
  if (ids.length === 0) return "1=0";
  return `${coluna} IN (${ids.join(",")})`;
}
