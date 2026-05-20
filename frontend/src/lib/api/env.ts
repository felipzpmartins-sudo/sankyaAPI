export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
  if (raw) return raw;
  if (import.meta.env.DEV) return "http://localhost:3000";
  throw new Error("VITE_API_URL não definido. Defina no .env.local antes do build.");
}
