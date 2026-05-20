/**
 * Sondagem exploratória do Sankhya — não modifica dados, só lê.
 *
 * Roda 1 chamada `loadRecords` (apenas 1 página = primeiras N linhas) por
 * entidade para descobrir:
 *   1. Se o usuário BIMKR tem permissão de leitura.
 *   2. Quais campos retornam valor não-nulo.
 *   3. Sample de valores para conferir formato (datas, decimais, flags).
 */
import { loadRecords } from "../src/sankhya/crud.js";

type Probe = {
  entity: string;
  fields: string[];
  expression?: string;
  description: string;
};

const PROBES: Probe[] = [
  {
    entity: "Parceiro",
    description: "Cadastro de clientes/fornecedores (TGFPAR)",
    fields: [
      "CODPARC",
      "NOMEPARC",
      "RAZAOSOCIAL",
      "CGC_CPF",
      "TIPPESSOA",
      "CLIENTE",
      "FORNECEDOR",
      "ATIVO",
      "CODCID",
    ],
    expression: "this.ATIVO = 'S' AND this.CLIENTE = 'S'",
  },
  {
    entity: "Vendedor",
    description: "Cadastro de vendedores (TGFVEN)",
    fields: ["CODVEND", "APELIDO", "ATIVO"],
    expression: "this.ATIVO = 'S'",
  },
  {
    entity: "Produto",
    description: "Cadastro de produtos (TGFPRO)",
    fields: [
      "CODPROD",
      "DESCRPROD",
      "CODVOL",
      "USOPROD",
      "ATIVO",
    ],
    expression: "this.ATIVO = 'S'",
  },
  {
    entity: "Financeiro",
    description: "Títulos a pagar/receber (TGFFIN) — campos DRE",
    fields: [
      "NUFIN",
      "CODEMP",
      "CODPARC",
      "DTNEG",
      "DTVENC",
      "VLRDESDOB",
      "CODTIPTIT",
      "CODNAT",
      "RECDESP",
      "PROVISAO",
    ],
    expression: "this.DTNEG >= TO_DATE('01/01/2026','DD/MM/YYYY')",
  },
  {
    entity: "Natureza",
    description: "Plano de contas (TGFNAT) — para categorização de despesas",
    fields: ["CODNAT", "DESCRNAT"],
  },
  {
    entity: "Financeiro",
    description: "DRE: despesas realizadas de jan/26",
    fields: ["NUFIN", "CODEMP", "VLRDESDOB", "CODNAT", "RECDESP"],
    expression:
      "this.DTNEG >= TO_DATE('01/01/2026','DD/MM/YYYY') AND this.RECDESP = -1 AND this.PROVISAO = 'N'",
  },
  {
    entity: "TipoTitulo",
    description: "Tipos de título (TGFTTI) — fluxo de caixa",
    fields: ["CODTIPTIT", "DESCRTIPTIT", "ATIVO"],
  },
];

async function probe(p: Probe): Promise<void> {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`>>> ${p.entity}  —  ${p.description}`);
  console.log(`    expression: ${p.expression ?? "(nenhuma)"}`);

  try {
    const res = await loadRecords({
      rootEntity: p.entity,
      fields: p.fields,
      expression: p.expression,
    });

    console.log(`    ✓ acesso OK | linhas nesta página: ${res.rows.length} | hasMore: ${res.hasMore}`);

    if (res.rows.length === 0) {
      console.log("    (sem linhas)");
      return;
    }

    const sample = res.rows.slice(0, 3);
    console.log(`    primeiras ${sample.length} linhas:`);
    console.table(sample);

    const allKeys = new Set<string>();
    for (const r of res.rows) for (const k of Object.keys(r)) allKeys.add(k);
    const requested = new Set(p.fields);
    const extras = [...allKeys].filter((k) => !requested.has(k));
    const missing = p.fields.filter((k) => !allKeys.has(k));
    if (extras.length) console.log(`    campos extras retornados: ${extras.join(", ")}`);
    if (missing.length) console.log(`    campos pedidos mas ausentes na resposta: ${missing.join(", ")}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`    ✗ FALHA: ${msg}`);
  }
}

async function main(): Promise<void> {
  console.log("Sondagem Sankhya — apenas leitura, 1 página por entidade\n");
  for (const p of PROBES) {
    await probe(p);
  }
  console.log("\n" + "=".repeat(80));
  console.log("Sondagem concluída.");
}

main().catch((err) => {
  console.error("erro fatal:", err);
  process.exit(1);
});
