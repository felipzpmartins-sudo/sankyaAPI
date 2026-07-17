export const AUTH_TOKEN_STORAGE_KEY = "sankhya_2_auth_token";

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

export async function apiJson<T>(
  pathname: string,
  query?: Record<string, string | number | undefined | null>,
): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const response = await fetch(`${getApiBaseUrl()}${pathname}${suffix}`, {
    headers: {
      Accept: "application/json",
      ...(getStoredAuthToken() ? { Authorization: `Bearer ${getStoredAuthToken()}` } : {}),
    },
  });
  const body = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) {
    if (response.status === 401) clearStoredAuthToken();
    throw new Error(body?.message ?? `Falha na API (${response.status})`);
  }
  return body as T;
}

export function empresaQuery(empresas: number[]): string {
  return empresas.length > 0 ? empresas.join(",") : "todas";
}
