export const AUTH_TOKEN_STORAGE_KEY = "sankhya_auth_token_v1";
export const LEGACY_AUTH_STORAGE_KEY = "sankhya_auth_v1";

export function getStoredAuthToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setStoredAuthToken(token: string) {
  try {
    sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    sessionStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  } catch {
    void 0;
  }
}

export function clearStoredAuthToken() {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  } catch {
    void 0;
  }
}
