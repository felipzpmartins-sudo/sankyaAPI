import { config } from "../config.js";
import type { AuthResponse, GatewayErrorResponse } from "./types.js";

/**
 * Teto por requisicao. Sem ele um fetch pendurado nunca resolve, a entidade
 * fica presa no conjunto `inflight` do scheduler e TODOS os ciclos seguintes
 * daquela entidade sao pulados em silencio — sem somar sucesso nem erro. Foi o
 * que travou o sync de titulos, e junto com ele o de rateio, que so roda depois.
 *
 * Vale por requisicao, nao pela carga inteira: cada pagina tem esse teto.
 * O abort cai em isRetryableError e entra no retry com backoff.
 */
const REQUEST_TIMEOUT_MS = 120_000;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let inflight: Promise<string> | null = null;

function authenticate(): Promise<string> {
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const body = new URLSearchParams({
        client_id: config.SANKHYA_CLIENT_ID,
        client_secret: config.SANKHYA_CLIENT_SECRET,
        grant_type: "client_credentials",
      });

      const res = await fetch(`${config.SANKHYA_BASE_URL}/authenticate`, {
        method: "POST",
        headers: {
          "X-Token": config.SANKHYA_TOKEN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Falha na autenticação Sankhya (${res.status}): ${text}`);
      }

      const data = (await res.json()) as AuthResponse;
      cachedToken = data.access_token;
      tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
      return cachedToken;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return authenticate();
}

function isExpiredTokenError(payload: unknown): boolean {
  const err = (payload as GatewayErrorResponse | undefined)?.error;
  return err?.codigo === "GTW3403";
}

export type RequestOptions = {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
};

async function sankhyaRequestOnce<T>(opts: RequestOptions): Promise<T> {
  const url = new URL(opts.path, config.SANKHYA_BASE_URL);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const doFetch = async (token: string) =>
    fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  let token = await getToken();
  let res = await doFetch(token);
  let payload = await res.json();

  if (isExpiredTokenError(payload)) {
    cachedToken = null;
    token = await authenticate();
    res = await doFetch(token);
    payload = await res.json();
  }

  if (!res.ok) {
    throw new Error(`Sankhya ${res.status}: ${JSON.stringify(payload)}`);
  }

  return payload as T;
}

const RETRY_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Falha de infraestrutura, nao erro de programa: vale tentar de novo.
 *
 * O 400 do /authenticate entra na lista porque o gateway devolve
 * "Erro ao se autenticar com o serviço externo" de forma intermitente quando
 * o ERP atras dele nao responde — nada muda tentando com outro payload. Sem
 * isso, um unico 400 derrubava o ciclo inteiro da entidade: era a origem dos
 * 132 erros de pedidos e 153 de titulos acumulados no sync_state.
 */
export function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message === "fetch failed") return true;
  // AbortSignal.timeout lanca DOMException TimeoutError, que nao traz cause.
  if (err.name === "TimeoutError" || err.name === "AbortError") return true;
  if (/^Sankhya (429|5dd):/.test(err.message)) return true;
  if (/^Falha na autenticação Sankhya (d+):/.test(err.message)) return true;

  const cause = err.cause;
  if (cause instanceof Error) {
    return /timeout|ECONNRESET|ENOTFOUND|EAI_AGAIN|UND_ERR/i.test(
      `${cause.name} ${cause.message}`,
    );
  }

  return false;
}

/**
 * Toda chamada ao Sankhya passa por aqui com retry. Antes o retry existia so
 * em crud.ts, e as varreduras por DbExplorerSP.executeQuery — que hoje
 * carregam titulos, pedidos e rateio — nao tinham nenhuma protecao.
 *
 * Todas as chamadas do projeto sao leitura, entao repetir e seguro.
 */
export async function sankhyaRequest<T>(opts: RequestOptions): Promise<T> {
  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= RETRY_ATTEMPTS; tentativa += 1) {
    try {
      return await sankhyaRequestOnce<T>(opts);
    } catch (err) {
      ultimoErro = err;
      if (!isRetryableError(err) || tentativa === RETRY_ATTEMPTS) break;
      // Token invalidado no meio da varredura: forca reautenticacao.
      cachedToken = null;
      await sleep(750 * tentativa);
    }
  }

  throw ultimoErro;
}
