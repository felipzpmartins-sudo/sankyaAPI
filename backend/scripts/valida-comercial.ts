/**
 * Confere as telas Comercial e Produtos contra o Sankhya.
 *
 * Roda os syncs do projeto num banco temporario, chama as mesmas funcoes de
 * servico das telas e compara cada numero com o agregado calculado direto no
 * Oracle. Sai com codigo 1 se algo divergir. Uso manual, nao entra no CI.
 *
 *   ENVPATH=/caminho/do/.env npx tsx scripts/valida-comercial.ts 2026-01-01 2026-11-05
 */
import { readFileSync } from "node:fs";

// Credenciais vem do .env informado em ENVPATH. Nada e impresso.
if (process.env.ENVPATH) {
  for (const bruta of readFileSync(process.env.ENVPATH, "utf8").split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha || linha.startsWith("#") || !linha.includes("=")) continue;
    const corte = linha.indexOf("=");
    process.env[linha.slice(0, corte).trim()] = linha.slice(corte + 1).trim();
  }
}
process.env.APP_LOGIN_EMAIL ??= "validacao@local.test";
process.env.APP_LOGIN_PASSWORD ??= "somente-para-validar-1234";
process.env.SYNC_ENABLED = "false";
process.env.LOG_LEVEL = "warn";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "confere-")), "teste.db");

const { migrate } = await import("../src/db/migrate.js");
const { executeQuery } = await import("../src/sankhya/query.js");
const { FATURAMENTO_TOPS, PEDIDO_VENDA_TOPS } = await import("../src/services/operacoes.js");
const S = await import("../src/services/comercial.js");
const syncs = [
  ["empresas", (await import("../src/sync/empresas.js")).syncEmpresas],
  ["tipos_operacao", (await import("../src/sync/tipos_operacao.js")).syncTiposOperacao],
  ["vendedores", (await import("../src/sync/vendedores.js")).syncVendedores],
  ["parceiros", (await import("../src/sync/parceiros.js")).syncParceiros],
  ["produtos", (await import("../src/sync/produtos.js")).syncProdutos],
  ["pedidos", (await import("../src/sync/pedidos.js")).syncPedidos],
  ["vinculos", (await import("../src/sync/vinculos.js")).syncVinculos],
  ["itens", (await import("../src/sync/itens.js")).syncItens],
  ["estoque", (await import("../src/sync/estoque.js")).syncEstoque],
] as const;

const INI = process.argv[2] ?? "2026-01-01";
const FIM = process.argv[3] ?? "2026-11-05";
const br = (iso: string) => iso.split("-").reverse().join("/");
const D_INI = `TO_DATE('${br(INI)}','DD/MM/YYYY')`;
const D_FIM_EXC = `TO_DATE('${br(FIM)}','DD/MM/YYYY') + 1`;
const TOPS = FATURAMENTO_TOPS.join(",");
const PED_TOPS = PEDIDO_VENDA_TOPS.join(",");

migrate();
for (const [nome, fn] of syncs) {
  const t0 = Date.now();
  await fn();
  console.log(`sync ${nome.padEnd(15)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function rows(sql: string): Promise<Record<string, unknown>[]> {
  const r = await executeQuery(sql);
  return r.rows.map((row) => Object.fromEntries(r.fields.map((f, i) => [f, row[i]])));
}
const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
let difs = 0;
const linha = (rotulo: string, painel: number | string, erp: number | string) => {
  const ok = typeof painel === "number" && typeof erp === "number"
    ? Math.abs(painel - erp) < 0.011 : painel === erp;
  if (!ok) difs++;
  console.log(`  ${ok ? "OK " : "DIF"} ${rotulo.padEnd(34)} painel=${String(painel).padStart(16)}  ERP=${String(erp).padStart(16)}`);
};
const filtros = { empresa: { modo: "todas" } as const, vendedor: { modo: "todos" } as const, periodo: { dataInicio: INI, dataFim: FIM } };

console.log(`\n================ PERIODO ${INI} a ${FIM} ================`);

// ---------------------------------------------------------------- COMERCIAL
const NOTA_REAL = `EXISTS (SELECT 1 FROM TGFVAR v JOIN TGFCAB n ON n.NUNOTA = v.NUNOTA
                   WHERE v.NUNOTAORIG = c.NUNOTA AND v.NUNOTA <> v.NUNOTAORIG AND n.TIPMOV <> 'P')`;
const PED = `c.TIPMOV = 'P' AND c.CODTIPOPER IN (${PED_TOPS}) AND c.DTNEG >= ${D_INI} AND c.DTNEG < ${D_FIM_EXC}`;
const pvn = S.pedidosVsNota({ ...filtros, limite: 500 });
const [e] = await rows(`
  SELECT COUNT(*) TOTAL, SUM(c.VLRNOTA) VALOR,
         SUM(CASE WHEN ${NOTA_REAL} THEN 1 ELSE 0 END) COM_NOTA,
         SUM(CASE WHEN c.PENDENTE = 'S' THEN 1 ELSE 0 END) PEND,
         SUM(CASE WHEN c.PENDENTE = 'S' THEN c.VLRNOTA ELSE 0 END) PEND_VLR,
         SUM(CASE WHEN c.PENDENTE = 'S' AND NOT ${NOTA_REAL} THEN 1 ELSE 0 END) SEM,
         SUM(CASE WHEN c.PENDENTE = 'S' AND NOT ${NOTA_REAL} THEN c.VLRNOTA ELSE 0 END) SEM_VLR
  FROM TGFCAB c WHERE ${PED} AND NVL(c.STATUSNOTA,'-') <> 'C'`);
console.log("\n[Comercial] KPIs");
linha("Pedidos de venda (qtd)", pvn.total_pedidos, n(e.TOTAL));
linha("Pedidos de venda (R$)", pvn.valor_total, r2(n(e.VALOR)));
linha("Viraram nota", pvn.com_nota, n(e.COM_NOTA));
linha("Pendentes (qtd)", pvn.pendentes, n(e.PEND));
linha("Pendentes (R$)", pvn.valor_pendente, r2(n(e.PEND_VLR)));
linha("  dos quais sem nota (qtd)", pvn.sem_nota, n(e.SEM));
linha("  dos quais sem nota (R$)", pvn.valor_sem_nota, r2(n(e.SEM_VLR)));
linha("  dos quais parciais", pvn.parciais, n(e.PEND) - n(e.SEM));
linha("Linhas da tabela de pendentes", pvn.pedidos.length, n(e.PEND));
const erpPendList = (await rows(`SELECT c.NUNOTA FROM TGFCAB c WHERE ${PED} AND c.PENDENTE = 'S' ORDER BY c.NUNOTA`)).map((r) => n(r.NUNOTA)).join(",");
linha("Tabela: mesmos pedidos", [...pvn.pedidos].map((p) => p.NUNOTA).sort((a, b) => a - b).join(",") === erpPendList ? "iguais" : "diferentes", "iguais");

const rv = S.rankingVendedores(filtros);
const erpRv = await rows(`SELECT NVL(c.CODVEND,0) CODVEND, COUNT(*) QT, SUM(c.VLRNOTA) VLR FROM TGFCAB c WHERE ${PED} GROUP BY NVL(c.CODVEND,0)`);
console.log("\n[Comercial] Ranking de vendedores");
linha("Vendedores com pedido", rv.vendedores.length, erpRv.length);
linha("Total (R$)", rv.total, r2(erpRv.reduce((s, r) => s + n(r.VLR), 0)));
const mRv = new Map(erpRv.map((r) => [n(r.CODVEND), r]));
const difRv = rv.vendedores.filter((v) => { const x = mRv.get(v.CODVEND); return !x || n(x.QT) !== v.pedidos || Math.abs(n(x.VLR) - v.valor) > 0.011; });
linha("Vendedor a vendedor", difRv.length === 0 ? "iguais" : `${difRv.length} difs`, "iguais");

// ----------------------------------------------------------------- PRODUTOS
const NF = `c.CODTIPOPER IN (${TOPS}) AND c.STATUSNOTA = 'L' AND c.DTFATUR IS NOT NULL AND c.DTFATUR >= ${D_INI} AND c.DTFATUR < ${D_FIM_EXC}`;
const abc = S.curvaAbc(filtros);
const erpProd = await rows(`
  SELECT i.CODPROD, SUM(i.QTDNEG) QTD, SUM(i.VLRTOT - i.VLRDESC) VLR
  FROM TGFITE i JOIN TGFCAB c ON c.NUNOTA = i.NUNOTA
  WHERE ${NF} AND NVL(i.USOPROD,'-') <> 'D'
  GROUP BY i.CODPROD HAVING SUM(i.VLRTOT - i.VLRDESC) > 0`);
erpProd.sort((a, b) => n(b.VLR) - n(a.VLR) || n(a.CODPROD) - n(b.CODPROD));
const erpTotal = erpProd.reduce((s, r) => s + n(r.VLR), 0);
const [notas] = await rows(`SELECT SUM(c.VLRNOTA) VLRNOTA, SUM(NVL(c.VLRFRETE,0)) FRETE FROM TGFCAB c WHERE ${NF}`);
console.log("\n[Produtos] Curva ABC");
linha("Faturamento por item (R$)", abc.total, r2(erpTotal));
linha("Produtos com venda", abc.produtos.length, erpProd.length);
console.log(`  reconciliacao: VLRNOTA ${r2(n(notas.VLRNOTA))} - frete ${r2(n(notas.FRETE))} = ${r2(n(notas.VLRNOTA) - n(notas.FRETE))}  |  itens ${r2(erpTotal)}  |  residuo ${r2(erpTotal - (n(notas.VLRNOTA) - n(notas.FRETE)))}`);
let acc = 0;
const curvaErp = new Map<number, string>();
for (const r of erpProd) { acc += (n(r.VLR) / erpTotal) * 100; curvaErp.set(n(r.CODPROD), acc <= 80 ? "A" : acc <= 95 ? "B" : "C"); }
for (const r of abc.resumo) {
  const sel = erpProd.filter((p) => curvaErp.get(n(p.CODPROD)) === r.curva);
  linha(`Curva ${r.curva} (produtos)`, r.produtos, sel.length);
  linha(`Curva ${r.curva} (R$)`, r.valor, r2(sel.reduce((s, p) => s + n(p.VLR), 0)));
}
const mProd = new Map(erpProd.map((r) => [n(r.CODPROD), r]));
const difProd = abc.produtos.filter((p) => { const x = mProd.get(p.CODPROD); return !x || Math.abs(n(x.VLR) - p.valor) > 0.011 || Math.abs(n(x.QTD) - p.qtd) > 0.011 || curvaErp.get(p.CODPROD) !== p.curva; });
linha("Produto a produto (valor/qtd/curva)", difProd.length === 0 ? "iguais" : `${difProd.length} difs`, "iguais");

const rk = S.rankingProdutos(filtros);
const erpMenos = [...erpProd].sort((a, b) => n(a.VLR) - n(b.VLR) || n(a.CODPROD) - n(b.CODPROD)).slice(0, 10).map((r) => n(r.CODPROD)).join(",");
console.log("\n[Produtos] Rankings");
linha("Top 10 mais vendidos", rk.mais_vendidos.map((r) => r.CODPROD).join(",") === erpProd.slice(0, 10).map((r) => n(r.CODPROD)).join(",") ? "iguais" : "diferentes", "iguais");
linha("Top 10 menos vendidos", rk.menos_vendidos.map((r) => r.CODPROD).join(",") === erpMenos ? "iguais" : "diferentes", "iguais");

const vpp = S.vendedoresPorProduto(filtros);
const erpVpp = await rows(`SELECT NVL(c.CODVEND,0) CODVEND, SUM(i.VLRTOT - i.VLRDESC) VLR FROM TGFITE i JOIN TGFCAB c ON c.NUNOTA = i.NUNOTA WHERE ${NF} AND NVL(i.USOPROD,'-') <> 'D' GROUP BY NVL(c.CODVEND,0)`);
const mVpp = new Map(erpVpp.map((r) => [n(r.CODVEND), n(r.VLR)]));
linha("Quem vende o que: total (R$)", vpp.total, r2(erpVpp.reduce((s, r) => s + n(r.VLR), 0)));
linha("Quem vende o que: por vendedor", vpp.vendedores.every((v) => Math.abs((mVpp.get(v.CODVEND) ?? 0) - v.valor) < 0.011) && vpp.vendedores.length === erpVpp.length ? "iguais" : "diferentes", "iguais");
// recorte por produto: o mais vendido
const top1 = rk.mais_vendidos[0];
const vp1 = S.vendedoresPorProduto({ ...filtros, codProd: top1.CODPROD });
const [e1] = await rows(`SELECT SUM(i.VLRTOT - i.VLRDESC) VLR FROM TGFITE i JOIN TGFCAB c ON c.NUNOTA = i.NUNOTA WHERE ${NF} AND NVL(i.USOPROD,'-') <> 'D' AND i.CODPROD = ${top1.CODPROD}`);
linha(`Quem vende o que: prod ${top1.CODPROD}`, vp1.total, r2(n(e1.VLR)));

const sv = S.produtosSemVenda({ ...filtros, limite: 3000 });
const [es] = await rows(`
  WITH fat AS (
    SELECT i.CODPROD, c.DTFATUR FROM TGFITE i JOIN TGFCAB c ON c.NUNOTA = i.NUNOTA
    WHERE c.CODTIPOPER IN (${TOPS}) AND c.STATUSNOTA = 'L' AND c.DTFATUR IS NOT NULL
      AND c.DTNEG >= TO_DATE('01/01/2025','DD/MM/YYYY')),
  per AS (SELECT DISTINCT CODPROD FROM fat WHERE DTFATUR >= ${D_INI} AND DTFATUR < ${D_FIM_EXC}),
  hist AS (SELECT DISTINCT CODPROD FROM fat),
  est AS (SELECT CODPROD, SUM(ESTOQUE) QT FROM TGFEST WHERE NVL(TIPO,'P') = 'P' AND NVL(CODPARC,0) = 0 GROUP BY CODPROD)
  SELECT COUNT(*) SEM_VENDA,
         SUM(CASE WHEN h.CODPROD IS NOT NULL THEN 1 ELSE 0 END) PARARAM,
         SUM(CASE WHEN h.CODPROD IS NULL THEN 1 ELSE 0 END) NUNCA,
         SUM(CASE WHEN NVL(e.QT,0) > 0 THEN 1 ELSE 0 END) COM_ESTOQUE
  FROM TGFPRO p LEFT JOIN hist h ON h.CODPROD = p.CODPROD LEFT JOIN est e ON e.CODPROD = p.CODPROD
  WHERE p.ATIVO = 'S' AND p.CODPROD NOT IN (SELECT CODPROD FROM per)`);
const [ea] = await rows(`SELECT COUNT(*) ATIVOS FROM TGFPRO WHERE ATIVO = 'S'`);
console.log("\n[Produtos] Ativos sem venda");
linha("Produtos ativos", sv.total_ativos, n(ea.ATIVOS));
linha("Sem venda no periodo", sv.sem_venda, n(es.SEM_VENDA));
linha("Pararam de vender", sv.pararam_de_vender, n(es.PARARAM));
linha("Nunca na janela", sv.nunca_na_janela, n(es.NUNCA));
linha("Com estoque proprio em maos", sv.com_estoque, n(es.COM_ESTOQUE));

console.log(`\n${difs === 0 ? "TUDO BATE" : difs + " DIVERGENCIA(S)"} — ${INI} a ${FIM}`);
process.exit(difs === 0 ? 0 : 1);
