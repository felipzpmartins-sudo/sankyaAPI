export const AUTH_TOKEN_STORAGE_KEY = "sankhya_3_auth_token";

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return "http://localhost:3000";
}

export function getStoredAuthToken(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? "";
}

export function setStoredAuthToken(token: string) {
  sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearStoredAuthToken() {
  sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

type ApiQuery = Record<string, string | number | undefined | null>;

function apiUrl(pathname: string, query?: ApiQuery): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return `${getApiBaseUrl()}${pathname}${suffix}`;
}

function authHeaders(): Record<string, string> {
  const token = getStoredAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiJson<T>(pathname: string, query?: ApiQuery): Promise<T> {
  const response = await fetch(apiUrl(pathname, query), {
    headers: {
      Accept: "application/json",
      ...authHeaders(),
    },
  });
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) {
    if (response.status === 401) clearStoredAuthToken();
    throw new Error(body?.message ?? `Falha na API (${response.status})`);
  }
  return body as T;
}

export async function apiBlob(pathname: string, query?: ApiQuery): Promise<Blob> {
  const response = await fetch(apiUrl(pathname, query), {
    headers: {
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ...authHeaders(),
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.status === 401) clearStoredAuthToken();
    throw new Error(body?.message ?? `Falha na API (${response.status})`);
  }
  return response.blob();
}

export function empresaQuery(empresas: number[]): string {
  return empresas.length > 0 ? empresas.join(",") : "todas";
}
