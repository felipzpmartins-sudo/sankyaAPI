import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiBaseUrl, getStoredAuthToken, setStoredAuthToken } from "@/lib/api";
import type { AppUser } from "@/components/LoginGate";

const TAMANHO_MINIMO = 8;

const campoClasse =
  "h-13 rounded-xl border-white/[0.08] bg-white/[0.035] pl-11 pr-12 text-[15px] text-white shadow-none placeholder:text-slate-600 hover:border-white/[0.14] focus-visible:border-primary/70 focus-visible:ring-3 focus-visible:ring-primary/15";

type Props = {
  email: string;
  onTrocada: (user: AppUser) => void;
};

/**
 * Primeira tela de quem entrou com a senha inicial. Fica no lugar do painel,
 * nao por cima dele: a conta so vale depois que a senha temporaria sai de
 * circulacao.
 */
export function TrocarSenha({ email, onTrocada }: Props) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const curta = novaSenha.length > 0 && novaSenha.length < TAMANHO_MINIMO;
  const divergem = confirmacao.length > 0 && novaSenha !== confirmacao;
  const repetida = novaSenha.length > 0 && novaSenha === senhaAtual;
  const podeEnviar =
    senhaAtual.length > 0 &&
    novaSenha.length >= TAMANHO_MINIMO &&
    novaSenha === confirmacao &&
    !repetida &&
    !enviando;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");

    try {
      const resposta = await fetch(`${getApiBaseUrl()}/api/auth/trocar-senha`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${getStoredAuthToken() ?? ""}`,
        },
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      const corpo = (await resposta.json().catch(() => ({}))) as {
        accessToken?: string;
        message?: string;
        user?: AppUser;
      };

      if (!resposta.ok || !corpo.accessToken || !corpo.user) {
        throw new Error(corpo.message ?? "Não foi possível trocar a senha.");
      }

      setStoredAuthToken(corpo.accessToken);
      onTrocada(corpo.user);
    } catch (causa) {
      setErro(
        causa instanceof TypeError
          ? "Não foi possível conectar ao servidor. Verifique sua conexão."
          : causa instanceof Error
            ? causa.message
            : "Falha ao trocar a senha.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#080d16] px-5 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0 login-grid opacity-30" />
      <div className="pointer-events-none absolute -left-52 -top-52 h-[540px] w-[540px] rounded-full bg-primary/20 blur-[150px]" />

      <div className="relative w-full max-w-[460px]">
        <span className="mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[0_0_32px_rgba(59,130,246,0.12)]">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-white">Escolha sua senha</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Sua conta foi criada com uma senha temporária. Defina uma senha só sua para continuar.
        </p>
        <p className="mt-2 text-sm text-slate-500">{email}</p>

        <form onSubmit={enviar} className="mt-8 space-y-5" noValidate>
          <div>
            <label htmlFor="senha-atual" className="mb-2 block text-sm font-medium text-slate-200">
              Senha temporária
            </label>
            <div className="group relative">
              <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-primary" />
              <Input
                id="senha-atual"
                type={mostrar ? "text" : "password"}
                autoComplete="current-password"
                autoFocus
                required
                value={senhaAtual}
                onChange={(evento) => setSenhaAtual(evento.target.value)}
                placeholder="A senha que você recebeu"
                className={campoClasse}
              />
              <button
                type="button"
                onClick={() => setMostrar((atual) => !atual)}
                className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={mostrar ? "Ocultar senhas" : "Mostrar senhas"}
                aria-pressed={mostrar}
              >
                {mostrar ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="senha-nova" className="mb-2 block text-sm font-medium text-slate-200">
              Nova senha
            </label>
            <div className="group relative">
              <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-primary" />
              <Input
                id="senha-nova"
                type={mostrar ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={TAMANHO_MINIMO}
                value={novaSenha}
                onChange={(evento) => setNovaSenha(evento.target.value)}
                placeholder={`Pelo menos ${TAMANHO_MINIMO} caracteres`}
                className={campoClasse}
                aria-invalid={curta || repetida}
              />
            </div>
            {curta && (
              <p className="mt-2 text-xs text-amber-300">
                Faltam {TAMANHO_MINIMO - novaSenha.length} caractere(s).
              </p>
            )}
            {repetida && (
              <p className="mt-2 text-xs text-amber-300">
                A nova senha precisa ser diferente da temporária.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="senha-confirma" className="mb-2 block text-sm font-medium text-slate-200">
              Repita a nova senha
            </label>
            <div className="group relative">
              <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-primary" />
              <Input
                id="senha-confirma"
                type={mostrar ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirmacao}
                onChange={(evento) => setConfirmacao(evento.target.value)}
                placeholder="Digite de novo"
                className={campoClasse}
                aria-invalid={divergem}
              />
            </div>
            {divergem && (
              <p className="mt-2 text-xs text-amber-300">As duas senhas não são iguais.</p>
            )}
          </div>

          {erro && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-400/15 bg-red-400/[0.07] px-4 py-3 text-sm leading-5 text-red-300"
            >
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
              {erro}
            </div>
          )}

          <Button
            type="submit"
            disabled={!podeEnviar}
            className="group h-13 w-full rounded-xl bg-primary text-[15px] font-semibold text-white shadow-[0_12px_36px_rgba(59,130,246,0.24)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-[0_16px_42px_rgba(59,130,246,0.32)]"
          >
            {enviando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar e entrar"
            )}
          </Button>
        </form>
      </div>
    </main>
  );
}
