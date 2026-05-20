import pino from "pino";
import { config } from "../config.js";
import { syncEmpresas } from "./empresas.js";
import { syncNaturezas } from "./naturezas.js";
import { syncPedidos } from "./pedidos.js";
import { syncProdutos } from "./produtos.js";
import { syncEstoque } from "./estoque.js";
import { syncTiposOperacao } from "./tipos_operacao.js";
import { syncTiposTitulo } from "./tipos_titulo.js";
import { syncTitulos } from "./titulos.js";
import { syncVendedores } from "./vendedores.js";

const logger = pino({
  level: config.LOG_LEVEL,
  transport: { target: "pino-pretty", options: { colorize: true } },
});

type SyncFn = () => Promise<void> | void;
const inflight = new Set<string>();

async function runSync(entity: string, fn: SyncFn): Promise<void> {
  if (inflight.has(entity)) {
    logger.warn({ entity }, "sync skip: ciclo anterior ainda em andamento");
    return;
  }
  inflight.add(entity);
  const startedAt = Date.now();
  try {
    await fn();
    logger.info({ entity, ms: Date.now() - startedAt }, "sync ok");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cause =
      err instanceof Error && err.cause
        ? err.cause instanceof Error
          ? `${err.cause.name}: ${err.cause.message}`
          : String(err.cause)
        : undefined;
    logger.error(
      { entity, err: message, cause, ms: Date.now() - startedAt },
      "sync falhou",
    );
  } finally {
    inflight.delete(entity);
  }
}

/**
 * Sequência inicial: dimensões primeiro (rápido), depois fatos.
 *   - Dimensões em paralelo: empresas (seed), tipos_operacao, naturezas, tipos_titulo.
 *   - Fatos sequenciais após: pedidos (depende do mapa TIPMOV); títulos virá na Etapa 6.
 */
async function initialSync(): Promise<void> {
  await Promise.all([
    runSync("empresas", syncEmpresas),
    runSync("tipos_operacao", syncTiposOperacao),
    runSync("naturezas", syncNaturezas),
    runSync("tipos_titulo", syncTiposTitulo),
    runSync("vendedores", syncVendedores),
    runSync("produtos", syncProdutos),
  ]);
  await Promise.all([
    runSync("pedidos", syncPedidos),
    runSync("titulos", syncTitulos),
    runSync("estoque", syncEstoque),
  ]);
}

const timers: NodeJS.Timeout[] = [];

export function startScheduler(): void {
  if (!config.SYNC_ENABLED) {
    logger.info("scheduler desligado (SYNC_ENABLED=false)");
    return;
  }

  logger.info(
    {
      hot: config.SYNC_INTERVAL_MS,
      slow: config.SYNC_INTERVAL_SLOW_MS,
    },
    "scheduler iniciando",
  );

  void initialSync();

  timers.push(
    setInterval(() => {
      void runSync("tipos_operacao", syncTiposOperacao);
      void runSync("naturezas", syncNaturezas);
      void runSync("tipos_titulo", syncTiposTitulo);
      void runSync("vendedores", syncVendedores);
    }, config.SYNC_INTERVAL_SLOW_MS),
  );

  timers.push(
    setInterval(() => {
      void runSync("pedidos", syncPedidos);
      void runSync("titulos", syncTitulos);
    }, config.SYNC_INTERVAL_MS),
  );
}

export function stopScheduler(): void {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
}
