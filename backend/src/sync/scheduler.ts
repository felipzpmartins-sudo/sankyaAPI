import pino from "pino";
import { config } from "../config.js";
import { syncCentrosResultado } from "./centros_resultado.js";
import { syncEmpresas } from "./empresas.js";
import { syncNaturezas } from "./naturezas.js";
import { syncProjetos } from "./projetos.js";
import { syncParceiros } from "./parceiros.js";
import { syncPedidos } from "./pedidos.js";
import { syncProdutos } from "./produtos.js";
import { syncEstoque } from "./estoque.js";
import { syncTiposOperacao } from "./tipos_operacao.js";
import { syncTiposTitulo } from "./tipos_titulo.js";
import { syncTitulos } from "./titulos.js";
import { syncVendedores } from "./vendedores.js";
import { syncRateio } from "./rateio.js";
import { getSyncState } from "./state.js";

const logger = pino({
  level: config.LOG_LEVEL,
  transport: { target: "pino-pretty", options: { colorize: true } },
});

type SyncFn = () => Promise<void> | void;
const inflight = new Set<string>();

function hasSnapshot(entity: string): boolean {
  const state = getSyncState(entity);
  return Boolean(state?.last_synced_at && state.row_count > 0);
}

async function runIfMissing(entity: string, fn: SyncFn): Promise<void> {
  if (hasSnapshot(entity)) {
    logger.info({ entity }, "sync boot skip: snapshot existente");
    return;
  }
  await runSync(entity, fn);
}

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
  await runSync("empresas", syncEmpresas);
  await Promise.all([
    runIfMissing("tipos_operacao", syncTiposOperacao),
    runIfMissing("naturezas", syncNaturezas),
    runIfMissing("projetos", syncProjetos),
    runIfMissing("centros_resultado", syncCentrosResultado),
    runIfMissing("tipos_titulo", syncTiposTitulo),
    runIfMissing("parceiros", syncParceiros),
    runIfMissing("vendedores", syncVendedores),
    runIfMissing("produtos", syncProdutos),
  ]);
  await Promise.all([
    runIfMissing("pedidos", syncPedidos),
    runIfMissing("titulos", syncTitulos),
    runIfMissing("estoque", syncEstoque),
  ]);

  // O rateio referencia os títulos por NUFIN. Em uma base nova, executá-lo
  // em paralelo com syncTitulos faz a consulta terminar antes de os títulos
  // serem gravados e registra um snapshot vazio. Aguarde a dependência para
  // que o primeiro diagnóstico da implantação já seja consistente.
  await runIfMissing("rateio", syncRateio);
}

const timers: NodeJS.Timeout[] = [];
let initialSyncInProgress = false;

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

  initialSyncInProgress = true;
  void initialSync().finally(() => {
    initialSyncInProgress = false;
  });

  timers.push(
    setInterval(() => {
      if (initialSyncInProgress) {
        logger.info("sync lento adiado: carga inicial ainda em andamento");
        return;
      }
      void runSync("tipos_operacao", syncTiposOperacao);
      void runSync("naturezas", syncNaturezas);
      void runSync("projetos", syncProjetos);
      void runSync("centros_resultado", syncCentrosResultado);
      void runSync("tipos_titulo", syncTiposTitulo);
      void runSync("parceiros", syncParceiros);
      void runSync("vendedores", syncVendedores);
    }, config.SYNC_INTERVAL_SLOW_MS),
  );

  timers.push(
    setInterval(() => {
      if (initialSyncInProgress) {
        logger.info("sync principal adiado: carga inicial ainda em andamento");
        return;
      }
      void (async () => {
        await runSync("pedidos", syncPedidos);
        await runSync("titulos", syncTitulos);
        await runSync("rateio", syncRateio);
      })();
    }, config.SYNC_INTERVAL_MS),
  );
}

export function stopScheduler(): void {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
  initialSyncInProgress = false;
}
