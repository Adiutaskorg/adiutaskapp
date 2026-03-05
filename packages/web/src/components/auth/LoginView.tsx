import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, User, BookOpen, Bell, Search, Sparkles } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { API_BASE } from "@/lib/api";

const FEATURES = [
  { icon: BookOpen, text: "Consulta tus notas al instante" },
  { icon: Bell, text: "Recibe alertas de entregas próximas" },
  { icon: Search, text: "Busca archivos de tus cursos" },
  { icon: Sparkles, text: "Todo desde un solo lugar" },
];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export function LoginView() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("estudiante@ufv.es");
  const [devLoading, setDevLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    navigate("/", { replace: true });
    return null;
  }

  const isNameValid = name.trim().length >= 2;

  const handleLogin = () => {
    window.location.href = `${API_BASE}/api/auth/login`;
  };

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNameValid) return;

    setDevLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/auth/dev-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email }),
      });

      if (!res.ok) throw new Error("Login failed");

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
      {/* Animated background gradient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.08, 0.12, 0.08],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-brand-600 blur-[120px]"
        />
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.04, 0.08, 0.04],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute -bottom-20 right-0 h-60 w-60 rounded-full bg-brand-700 blur-[100px]"
        />
      </div>

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="relative z-10 w-full max-w-sm text-center"
      >
        {/* Logo */}
        <motion.div
          variants={fadeUp}
          className="mx-auto mb-8"
        >
          <img src="/logo.png" alt="adiutask" className="mx-auto h-24 w-24 rounded-3xl shadow-glow-brand" />
        </motion.div>

        {/* Title */}
        <motion.div variants={fadeUp}>
          <h1 className="font-display text-3xl font-bold text-white">adiutask</h1>
          <p className="mt-2 text-sm text-surface-400">
            Tu asistente académico en la UFV
          </p>
        </motion.div>

        {/* Features */}
        <motion.div variants={fadeUp} className="mt-8 space-y-2">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className="card flex items-center gap-3 px-4 py-3 text-left"
            >
              <feature.icon className="h-4 w-4 shrink-0 text-brand-400" />
              <span className="text-sm text-surface-200">{feature.text}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Login form */}
        <motion.form
          variants={fadeUp}
          onSubmit={handleDevLogin}
          className="mt-8 space-y-3"
        >
          <div className="relative">
            <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="¿Cómo te llamas?"
              autoComplete="name"
              className="card w-full py-3.5 pl-11 pr-4 text-sm text-white
                         placeholder:text-surface-500 outline-none
                         transition-all focus:border-brand-500/30 focus:shadow-glow-brand"
            />
          </div>

          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-surface-500">
              @
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu-email@ufv.es"
              autoComplete="email"
              className="card w-full py-3.5 pl-11 pr-4 text-sm text-white
                         placeholder:text-surface-500 outline-none
                         transition-all focus:border-brand-500/30 focus:shadow-glow-brand"
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="card border-accent-danger/20 bg-accent-danger/5 p-3 text-sm text-accent-danger"
            >
              {error}
            </motion.div>
          )}

          <motion.button
            type="submit"
            disabled={!isNameValid || devLoading}
            whileTap={{ scale: 0.98 }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600
                       px-6 py-3.5 font-display text-sm font-semibold text-white
                       shadow-glow-brand transition-all
                       hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600"
          >
            {devLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                Entrar
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </motion.button>
        </motion.form>

        {/* SSO login button */}
        <motion.button
          variants={fadeUp}
          onClick={handleLogin}
          whileTap={{ scale: 0.98 }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl
                     border border-white/[0.06] bg-surface-850 px-6 py-3 text-sm text-surface-300
                     transition-all hover:border-white/[0.1] hover:bg-surface-800"
        >
          Iniciar sesión con mi cuenta UFV
          <ArrowRight className="h-4 w-4" />
        </motion.button>

        <motion.p variants={fadeUp} className="mt-4 text-2xs text-surface-600">
          Se usará el sistema de autenticación de la Universidad Francisco de Vitoria
        </motion.p>
      </motion.div>
    </div>
  );
}
