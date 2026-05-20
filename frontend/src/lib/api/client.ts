import { getApiBaseUrl } from "./env";

export class ApiError extends Error {
  readonly status: number;
  readonly bodySnippet?: string;
  readonly code?: string;

  constructor(message: string, status: number, bodySnippet?: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.bodySnippet = bodySnippet;
    this.code = code;
  }
}

export async function apiJson<T>(
  pathname: string,
  init?: { query?: Record<string, string | number | undefined | null> },
): Promise<T> {
  const base = getApiBaseUrl();
  const q = new URLSearchParams();
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    }
  }
  const qs = q.toString();
  const url = `${base}${pathname}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "omit",
  });
  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";

  if (!ct.includes("application/json")) {
    throw new ApiError(
      "Resposta não é JSON — verifique VITE_API_URL e se o backend está no ar.",
      res.status,
      text.slice(0, 240),
      "non_json_response",
    );
  }

  let body: unknown;
  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new ApiError("Corpo não é JSON válido.", res.status, text.slice(0, 240));
  }

  if (!res.ok) {
    const msg =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `Erro HTTP ${res.status}`;
    throw new ApiError(msg, res.status, text.slice(0, 240));
  }

  return body as T;
}
