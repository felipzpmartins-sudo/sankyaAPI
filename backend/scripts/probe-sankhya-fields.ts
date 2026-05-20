import { sankhyaRequest } from "../src/sankhya/client.js";

const ENTITIES = ["Produto", "Estoque"];

async function probe(entity: string): Promise<void> {
  console.log(`\n=== ${entity} ===`);
  try {
    const raw = await sankhyaRequest<unknown>({
      method: "POST",
      path: "/gateway/v1/mge/service.sbr",
      query: {
        serviceName: "CRUDServiceProvider.loadRecords",
        outputType: "json",
      },
      body: {
        serviceName: "CRUDServiceProvider.loadRecords",
        requestBody: {
          dataSet: {
            rootEntity: entity,
            includePresentationFields: "N",
            offsetPage: "0",
            criteria: { expression: { $: "1=0" } },
            entity: { fieldset: { list: "*" } },
          },
        },
      },
    });

    console.log(JSON.stringify(raw, null, 2).slice(0, 4000));
  } catch (err) {
    console.error(`${entity} failed:`, err instanceof Error ? err.message : err);
  }
}

async function main(): Promise<void> {
  for (const entity of ENTITIES) {
    await probe(entity);
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
