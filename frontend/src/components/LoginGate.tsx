import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearStoredAuthToken,
  getApiBaseUrl,
  getStoredAuthToken,
  setStoredAuthToken,
} from "@/lib/api";

export function LoginGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [setup, setSetup] = useState<{ qrCodeUrl: string; manualKey: string } | null>(null);
  const [setupError, setSetupError] = useState(false);

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/auth/setup`, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar configuracao");
        return response.json() as Promise<{ qrCodeUrl: string; manualKey: string }>;
      })
      .then(setSetup)
      .catch(() => setSetupError(true));

    const token = getStoredAuthToken();
    if (!token) {
      setReady(true);
      return;
    }
    fetch(`${getApiBaseUrl()}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then((response) => {
        if (!response.ok) throw new Error("Sessao expirada");
        setAuthenticated(true);
      })
      .catch(() => clearStoredAuthToken())
      .finally(() => setReady(true));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await response.json() as { accessToken?: string; message?: string };
      if (!response.ok || !body.accessToken) throw new Error(body.message ?? "Codigo invalido");
      setStoredAuthToken(body.accessToken);
      setAuthenticated(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao autenticar");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return <div className="min-h-screen bg-background" />;
  if (authenticated) return <>{children}</>;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="grid w-full max-w-4xl gap-4 md:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={submit} className="rounded-2xl border border-border bg-surface p-8 shadow-2xl">
          <div className="mb-6 grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Sankya 2.0</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Escaneie o QR Code ao lado no Google Authenticator e informe o código de 6 dígitos.
          </p>
          <Input
            className="mt-6 h-12 text-center text-lg tracking-[0.35em]"
            inputMode="numeric"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-label="Código de autenticação"
          />
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <Button className="mt-5 w-full" disabled={code.length !== 6 || submitting}>
            {submitting ? "Validando..." : "Entrar"}
          </Button>
        </form>

        <section className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface p-6 shadow-2xl">
          <h2 className="text-base font-semibold text-foreground">Google Authenticator</h2>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            Use o botão + e escolha “Ler código QR”.
          </p>
          <div className="mt-5 grid h-[260px] w-[260px] place-items-center rounded-2xl bg-white p-3">
            {setup ? (
              <img
                src={setup.qrCodeUrl}
                alt="QR Code para configurar o Google Authenticator"
                className="h-full w-full"
              />
            ) : (
              <span className="text-center text-sm text-slate-600">
                {setupError ? "Não foi possível carregar o QR Code." : "Carregando QR Code..."}
              </span>
            )}
          </div>
          {setup && (
            <div className="mt-4 w-full text-center">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Chave manual</p>
              <code className="mt-1 block break-all rounded-lg bg-background px-3 py-2 text-xs text-foreground">
                {setup.manualKey}
              </code>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
