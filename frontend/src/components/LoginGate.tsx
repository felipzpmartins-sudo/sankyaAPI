import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrocarSenha } from "@/components/TrocarSenha";
import {
  clearStoredAuthToken,
  getApiBaseUrl,
  getStoredAuthToken,
  setStoredAuthToken,
} from "@/lib/api";

type LoginResponse = {
  accessToken?: string;
  message?: string;
  user?: AppUser;
};

export type AppUser = {
  email: string;
  role: "executive" | "viacerta";
  /** Conta criada com senha temporaria e ainda nao trocada. */
  deveTrocarSenha?: boolean;
};

const AuthUserContext = createContext<AppUser | null>(null);

export function useAuthUser() {
  return useContext(AuthUserContext);
}

export function LoginGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = getStoredAuthToken();
    if (!token) {
      setReady(true);
      return;
    }

    fetch(`${getApiBaseUrl()}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Sessão expirada");
        const body = (await response.json()) as { user?: AppUser };
        if (!body.user) throw new Error("Sessão inválida");
        setUser(body.user);
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
      const response = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = (await response.json().catch(() => ({}))) as LoginResponse;
      if (!response.ok || !body.accessToken) {
        throw new Error(body.message ?? "Não foi possível entrar. Tente novamente.");
      }

      setStoredAuthToken(body.accessToken);
      if (!body.user) throw new Error("Não foi possível identificar o perfil de acesso.");
      setUser(body.user);
      setAuthenticated(true);
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? "Não foi possível conectar ao servidor. Verifique sua conexão."
          : cause instanceof Error
            ? cause.message
            : "Falha ao autenticar.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#080d16]" aria-label="Carregando">
        <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
      </main>
    );
  }
  // Senha temporaria ainda em uso: a troca vem antes do painel, e nao por
  // cima dele. Vale tambem ao recarregar a pagina, porque /auth/session
  // devolve a mesma marca que o login.
  if (authenticated && user?.deveTrocarSenha) {
    return <TrocarSenha email={user.email} onTrocada={setUser} />;
  }

  if (authenticated && user) {
    return <AuthUserContext.Provider value={user}>{children}</AuthUserContext.Provider>;
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080d16] text-foreground">
      <div className="pointer-events-none absolute inset-0 login-grid opacity-30" />
      <div className="pointer-events-none absolute -left-52 -top-52 h-[540px] w-[540px] rounded-full bg-primary/20 blur-[150px]" />
      <div className="pointer-events-none absolute -bottom-72 right-[-10rem] h-[620px] w-[620px] rounded-full bg-cyan-400/10 blur-[170px]" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1440px] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden px-12 py-10 lg:flex xl:px-20 xl:py-14">
          <Brand />

          <div className="max-w-2xl pb-8">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-2 text-xs font-medium text-blue-200 backdrop-blur-xl">
              <Sparkles className="h-3.5 w-3.5 text-blue-400" />
              Inteligência financeira em tempo real
            </div>
            <h1 className="max-w-xl text-5xl font-semibold leading-[1.08] tracking-[-0.045em] text-white xl:text-6xl">
              Decisões melhores começam com uma visão clara.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-400 xl:text-lg">
              Acompanhe os indicadores do Grupo MKR em um ambiente seguro, conectado e feito para transformar dados em direção.
            </p>

            <div className="mt-10 grid max-w-xl grid-cols-2 gap-4">
              <div className="login-glass-card rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Visão consolidada</span>
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-400/10 text-emerald-400">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-tight text-white">100%</p>
                <p className="mt-1 text-xs text-slate-500">Dados centralizados</p>
              </div>
              <div className="login-glass-card rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Monitoramento</span>
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-400/10 text-blue-400">
                    <BarChart3 className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-tight text-white">24/7</p>
                <p className="mt-1 text-xs text-slate-500">Indicadores disponíveis</p>
              </div>
            </div>
          </div>

          <p className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Ambiente protegido e acesso criptografado
          </p>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-10 lg:border-l lg:border-white/[0.06] lg:bg-[#0a101c]/55 lg:px-14 lg:backdrop-blur-sm xl:px-20">
          <div className="w-full max-w-[440px]">
            <div className="mb-12 lg:hidden">
              <Brand />
            </div>

            <div className="mb-9">
              <span className="mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[0_0_32px_rgba(59,130,246,0.12)]">
                <LockKeyhole className="h-5 w-5" />
              </span>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
                Bem-vindo de volta
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Entre com suas credenciais para acessar o painel executivo.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-slate-200">
                  E-mail
                </label>
                <div className="group relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-primary" />
                  <Input
                    id="login-email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoFocus
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="voce@empresa.com.br"
                    className="h-13 rounded-xl border-white/[0.08] bg-white/[0.035] pl-11 pr-4 text-[15px] text-white shadow-none placeholder:text-slate-600 hover:border-white/[0.14] focus-visible:border-primary/70 focus-visible:ring-3 focus-visible:ring-primary/15"
                    aria-invalid={Boolean(error)}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="login-password" className="text-sm font-medium text-slate-200">
                    Senha
                  </label>
                  <span className="text-xs text-slate-500">Acesso restrito</span>
                </div>
                <div className="group relative">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-primary" />
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Digite sua senha"
                    className="h-13 rounded-xl border-white/[0.08] bg-white/[0.035] pl-11 pr-12 text-[15px] text-white shadow-none placeholder:text-slate-600 hover:border-white/[0.14] focus-visible:border-primary/70 focus-visible:ring-3 focus-visible:ring-primary/15"
                    aria-invalid={Boolean(error)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-red-400/15 bg-red-400/[0.07] px-4 py-3 text-sm leading-5 text-red-300"
                >
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={!email.trim() || password.length < 8 || submitting}
                className="group h-13 w-full rounded-xl bg-primary text-[15px] font-semibold text-white shadow-[0_12px_36px_rgba(59,130,246,0.24)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-[0_16px_42px_rgba(59,130,246,0.32)]"
              >
                {submitting ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    Entrar no painel
                    <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500">
              <CheckCircle2 className="h-4 w-4 text-emerald-400/80" />
              Seus dados permanecem protegidos
            </div>

            <p className="mt-14 text-center text-[11px] text-slate-600">
              © {new Date().getFullYear()} Grupo MKR · Sankhya 3.0
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3" aria-label="Sankhya 3.0">
      <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-primary text-white shadow-[0_8px_28px_rgba(59,130,246,0.28)]">
        <span className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-cyan-300/40 blur-sm" />
        <BarChart3 className="relative h-5 w-5" />
      </span>
      <span>
        <span className="block text-[17px] font-semibold leading-tight tracking-[-0.02em] text-white">Sankhya</span>
        <span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Executive 3.0</span>
      </span>
    </div>
  );
}
