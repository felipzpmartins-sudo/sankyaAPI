import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { Lock, ArrowRight } from "lucide-react";
import { SmokeyBackground } from "@/components/ui/smokey-background";
import { clearStoredAuthToken, getStoredAuthToken, setStoredAuthToken } from "@/lib/auth";
import { getApiBaseUrl } from "@/lib/api/env";

export function LoginGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const storedToken = getStoredAuthToken();
    if (!storedToken) {
      setReady(true);
      return;
    }

    void fetch(`${getApiBaseUrl()}/api/auth/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token: storedToken }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("invalid_token");
        setAuthed(true);
      })
      .catch(() => {
        clearStoredAuthToken();
      })
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  if (authed) return <>{children}</>;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedToken = token.trim();
    if (!trimmedToken) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token: trimmedToken }),
      });
      if (!res.ok) throw new Error("invalid_token");
      setStoredAuthToken(trimmedToken);
      setAuthed(true);
    } catch {
      clearStoredAuthToken();
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center px-6 overflow-hidden"
      style={{ background: "#000000", fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
    >
      <SmokeyBackground color="#1E5FCC" />
      <div className="absolute inset-0 backdrop-blur-2xl bg-black/40" />

      <div
        className={`relative z-10 w-full max-w-[420px] ${shake ? "animate-[shake_0.4s_ease]" : ""}`}
        style={{
          background: "rgba(18, 21, 32, 0.65)",
          border: "1px solid rgba(77, 163, 255, 0.12)",
          borderRadius: 18,
          padding: 40,
          boxShadow: "0 40px 100px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03) inset",
          backdropFilter: "blur(24px)",
        }}
      >
        <div className="flex flex-col items-center mb-8">
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "linear-gradient(135deg, #4DA3FF 0%, #1E5FCC 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#000000",
              boxShadow: "0 10px 30px -10px rgba(77, 163, 255, 0.5)",
              marginBottom: 18,
            }}
          >
            <Lock size={22} strokeWidth={2.5} />
          </div>
          <h1
            style={{
              color: "#fff",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Maker.OS Command Center
          </h1>
          <p
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginTop: 8,
            }}
          >
            Acesso restrito
          </p>
        </div>

        <form onSubmit={onSubmit}>
          <div className="relative">
            <input
              type="password"
              autoFocus
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setError(false);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder=" "
              id="pw"
              style={{
                width: "100%",
                background: "rgba(10, 12, 16, 0.6)",
                border: `1px solid ${error ? "#dc2626" : focused ? "#4DA3FF" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 10,
                padding: "18px 16px 14px",
                color: "#fff",
                fontSize: 14,
                outline: "none",
                transition: "border-color 0.2s, box-shadow 0.2s",
                fontFamily: "inherit",
                boxShadow: focused && !error ? "0 0 0 4px rgba(77, 163, 255, 0.08)" : "none",
              }}
            />
            <label
              htmlFor="pw"
              style={{
                position: "absolute",
                left: 16,
                top: focused || token ? 6 : 16,
                fontSize: focused || token ? 10 : 13,
                color: focused ? "#4DA3FF" : "rgba(255,255,255,0.5)",
                letterSpacing: focused || token ? "0.1em" : "0",
                textTransform: focused || token ? "uppercase" : "none",
                pointerEvents: "none",
                transition: "all 0.2s ease",
              }}
            >
              Token de acesso
            </label>
          </div>

          {error && (
            <div style={{ color: "#ef4444", fontSize: 12, marginTop: 10, paddingLeft: 4 }}>
              Token invalido ou backend indisponivel.
            </div>
          )}

          <button
            type="submit"
            className="group"
            disabled={submitting}
            style={{
              marginTop: 24,
              width: "100%",
              background: "linear-gradient(135deg, #4DA3FF 0%, #1E5FCC 100%)",
              color: "#000000",
              border: "none",
              borderRadius: 10,
              padding: "14px 16px",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              cursor: "pointer",
              transition: "filter 0.15s, transform 0.15s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "0 10px 30px -10px rgba(77, 163, 255, 0.4)",
              opacity: submitting ? 0.75 : 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1)")}
          >
            {submitting ? "Validando..." : "Entrar"}
            <ArrowRight size={16} strokeWidth={2.5} />
          </button>
        </form>

        <div
          style={{
            marginTop: 28,
            color: "rgba(255,255,255,0.3)",
            fontSize: 11,
            textAlign: "center",
            letterSpacing: "0.05em",
          }}
        >
          Apenas usuários autorizados
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}
