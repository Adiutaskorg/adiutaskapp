import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, ArrowRight, User } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";

export function LoginView() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("estudiante@ufv.es");
  const [devLoading, setDevLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already authenticated, redirect
  if (isAuthenticated) {
    navigate("/", { replace: true });
    return null;
  }

  const isNameValid = name.trim().length >= 2;

  const handleLogin = () => {
    // Redirect to SSO/CAS login endpoint
    window.location.href = "/api/auth/login";
  };

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isNameValid) return;

    setDevLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email }),
      });

      if (!res.ok) {
        throw new Error("Login failed");
      }

      const data = await res.json();
      login(data.token, data.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError("Error al iniciar sesión de desarrollo");
      console.error("[Dev Login]", err);
    } finally {
      setDevLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface-950 px-6">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-brand-600/10 blur-3xl" />
        <div className="absolute -bottom-20 right-0 h-60 w-60 rounded-full bg-brand-700/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm text-center">
        {/* Logo */}
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-600 shadow-lg shadow-brand-600/20">
          <GraduationCap className="h-10 w-10 text-white" />
        </div>

        {/* Title */}
        <h1 className="font-display text-3xl font-bold text-white">UniBot</h1>
        <p className="mt-2 text-sm text-surface-200/60">
          Tu asistente académico en la UFV
        </p>

        {/* Features */}
        <div className="mt-8 space-y-3 text-left">
          {[
            "Consulta tus notas al instante",
            "Recibe alertas de entregas próximas",
            "Busca archivos de tus cursos",
            "Todo desde un solo lugar",
          ].map((feature, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-surface-800/30 px-4 py-3"
            >
              <div className="h-1.5 w-1.5 rounded-full bg-brand-400" />
              <span className="text-sm text-surface-100">{feature}</span>
            </div>
          ))}
        </div>

        {/* Login form */}
        <form onSubmit={handleDevLogin} className="mt-8 space-y-3">
          {/* Name input */}
          <div className="relative">
            <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-200/40" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="¿Cómo te llamas?"
              autoComplete="name"
              className="w-full rounded-2xl border border-surface-700 bg-surface-800/50 py-4 pl-11 pr-4
                         text-sm text-white placeholder:text-surface-200/40
                         outline-none transition-all
                         focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Email input */}
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-surface-200/40">@</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu-email@ufv.es"
              autoComplete="email"
              className="w-full rounded-2xl border border-surface-700 bg-surface-800/50 py-4 pl-11 pr-4
                         text-sm text-white placeholder:text-surface-200/40
                         outline-none transition-all
                         focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-xl border border-accent-danger/30 bg-accent-danger/10 p-3 text-sm text-accent-danger">
              {error}
            </div>
          )}

          {/* Entrar button */}
          <button
            type="submit"
            disabled={!isNameValid || devLoading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600
                       px-6 py-4 font-display text-sm font-semibold text-white
                       shadow-lg shadow-brand-600/20 transition-all
                       hover:bg-brand-500 hover:shadow-brand-500/30
                       active:scale-[0.98] disabled:opacity-50 disabled:hover:bg-brand-600"
          >
            {devLoading ? "Entrando..." : "Entrar"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {/* SSO login button — secondary */}
        <button
          onClick={handleLogin}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-surface-700
                     bg-surface-800/50 px-6 py-3 text-sm text-surface-200
                     transition-all hover:border-brand-500/30 hover:bg-surface-800
                     active:scale-[0.98]"
        >
          Iniciar sesión con mi cuenta UFV
          <ArrowRight className="h-4 w-4" />
        </button>

        <p className="mt-4 text-2xs text-surface-200/30">
          Se usará el sistema de autenticación de la Universidad Francisco de Vitoria
        </p>
      </div>
    </div>
  );
}
