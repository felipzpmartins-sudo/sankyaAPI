import { loadRecords } from "../src/sankhya/crud.ts";

async function tryFields(entityName: string, fields: string[], expression: string): Promise<void> {
  try {
    const res = await loadRecords({ rootEntity: entityName, fields, expression });
    const keys = new Set<string>();
    for (const row of res.rows) {
      for (const key of Object.keys(row)) keys.add(key);
    }

    console.log(`rows: ${res.rows.length}, hasMore: ${res.hasMore}`);
    console.log(`fields returned (${keys.size}): ${[...keys].sort().join(", ")}`);
    console.log("first row sample:", JSON.stringify(res.rows[0] ?? {}, null, 2));
  } catch (err) {
    console.error(`failed with fields: ${fields.join(", ")}`);
    console.error(err);
  }
}

async function probe(): Promise<void> {
  const entities = [
    {
      name: "CabecalhoNota",
      baseFields: [
        "NUNOTA",
        "CODEMP",
        "CODPARC",
        "CODVEND",
        "CODTIPOPER",
        "STATUSNOTA",
      ],
      candidateFields: [
        "CODCENCUS",
        "CODPROJ",
        "CentroResultado_DESCRCENCUS",
        "Projeto_DESCRPROJ",
      ],
      expression: "this.DTNEG >= TO_DATE('01/01/2025','DD/MM/YYYY') AND this.STATUSNOTA = 'L'",
    },
    {
      name: "Financeiro",
      baseFields: [
        "NUFIN",
        "CODEMP",
        "CODPARC",
        "CODTIPTIT",
        "CODNAT",
        "RECDESP",
        "PROVISAO",
      ],
      candidateFields: [
        "CODCENCUS",
        "CODPROJ",
        "CentroResultado_DESCRCENCUS",
        "Projeto_DESCRPROJ",
      ],
      expression: "this.DTNEG >= TO_DATE('01/01/2026','DD/MM/YYYY')",
    },
    {
      name: "Projeto",
      baseFields: ["CODPROJ"],
      candidateFields: ["IDENTIFICACAO", "DESCRPROJ", "ATIVO"],
      expression: "1=1",
    },
  ];

  for (const entity of entities) {
    console.log(`\n=== ${entity.name} ===`);
    await tryFields(entity.name, entity.baseFields, entity.expression);

    for (const candidate of entity.candidateFields) {
      console.log(`\n--- testing candidate: ${candidate}`);
      await tryFields(entity.name, [...entity.baseFields, candidate], entity.expression);
    }
  }
}

probe().catch((err) => {
  console.error(err);
  process.exit(1);
});
