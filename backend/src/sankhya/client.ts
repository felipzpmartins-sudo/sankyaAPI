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

export async function sankhyaRequest<T>(opts: RequestOptions): Promise<T> {
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
