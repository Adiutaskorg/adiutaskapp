import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Link2,
  Bell,
  BellOff,
  LogOut,
  ChevronRight,
  CheckCircle,
  XCircle,
  Wifi,
  WifiOff,
  Loader2,
  Info,
  Shield,
  Unlink,
  ExternalLink,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { useChatStore } from "@/stores/chat.store";
import { API_BASE } from "@/lib/api";

const CANVAS_SETTINGS_URL = "https://ufv-es.instructure.com/profile/settings";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } },
};

export function SettingsView() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  const initials = user?.name
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "?";

  const hasCanvas = !!user?.hasCanvas;
  const [showCanvasGuide, setShowCanvasGuide] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const handleRequestNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") {
      alert("Tu navegador no soporta notificaciones.");
      return;
    }
    if (Notification.permission === "denied") {
      alert("Las notificaciones están bloqueadas. Actívalas en la configuración de tu navegador para este sitio.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      if (permission === "granted") {
        new Notification("adiutask", { body: "Notificaciones activadas correctamente" });
      }
    } catch {
      alert("No se pudieron activar las notificaciones. Inténtalo desde la configuración del navegador.");
    }
  }, []);

  const handleUnlinkCanvas = useCallback(async () => {
    if (!confirm("¿Seguro que quieres desvincular Canvas? Tendrás que volver a conectar tu token.")) return;
    setUnlinking(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/canvas`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        updateUser({ hasCanvas: false, canvasUserId: undefined });
      }
    } catch {
      alert("Error al desvincular Canvas. Inténtalo de nuevo.");
    } finally {
      setUnlinking(false);
    }
  }, [token, updateUser]);

  return (
    <div className="scrollbar-hidden h-full overflow-y-auto px-4 py-5">
      <div className="mx-auto max-w-lg">
        <motion.div variants={stagger} initial="hidden" animate="show">
          {/* Profile header */}
          <motion.div variants={fadeUp} className="mb-6 flex flex-col items-center">
            <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-brand-600/15 ring-2 ring-brand-400/25 text-2xl font-bold text-brand-300">
              {initials}
            </div>
            <h2 className="font-display text-lg font-bold text-white">{user?.name}</h2>
            <p className="text-sm text-surface-400">{user?.email}</p>
          </motion.div>

          {/* Account section */}
          <motion.div variants={fadeUp} className="mb-3">
            <SectionLabel>Cuenta</SectionLabel>
            <div className="card overflow-hidden divide-y divide-white/[0.04]">
              <SettingRow
                icon={User}
                label="Perfil"
                description="Tu nombre y datos personales"
                value={user?.name}
              />
              <SettingRow
                icon={Link2}
                label="Canvas LMS"
                description={hasCanvas ? "Tu campus virtual está vinculado" : "Vincula para ver notas y entregas"}
                value={
                  hasCanvas ? (
                    <StatusBadge type="success" label="Vinculado" />
                  ) : (
                    <span className="rounded-lg bg-brand-600 px-2.5 py-1 text-2xs font-medium text-white">
                      Conectar
                    </span>
                  )
                }
                onClick={hasCanvas ? undefined : () => setShowCanvasGuide(!showCanvasGuide)}
              />
              <AnimatePresence>
                {/* Canvas connection guide (when NOT linked) */}
                {showCanvasGuide && !hasCanvas && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mx-4 mb-3 rounded-xl bg-surface-800/60 p-4 space-y-3">
                      <p className="text-sm font-medium text-surface-200">Para vincular Canvas:</p>
                      <ol className="list-decimal ml-4 space-y-2 text-sm text-surface-300">
                        <li>
                          Abre{" "}
                          <a
                            href={CANVAS_SETTINGS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-brand-400 underline underline-offset-2"
                          >
                            Canvas &rarr; Configuración
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </li>
                        <li>Busca la sección <strong className="text-surface-100">"Tokens de acceso autorizados"</strong></li>
                        <li>Clic en <strong className="text-surface-100">"+ Nuevo token de acceso"</strong></li>
                        <li>Ponle nombre (ej: "adiutask") y genera el token</li>
                        <li>
                          Copia el token y envíalo al chat:
                          <code className="mt-1 block rounded-lg bg-surface-900 px-3 py-2 text-brand-300 font-mono text-xs">
                            conectar tu-token-aquí
                          </code>
                        </li>
                      </ol>
                    </div>
                  </motion.div>
                )}
                {/* Canvas unlink option (when linked) */}
                {hasCanvas && (
                  <motion.div layout>
                    <button
                      type="button"
                      onClick={handleUnlinkCanvas}
                      disabled={unlinking}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-accent-danger transition-colors hover:bg-accent-danger/5 active:bg-accent-danger/10"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-danger/10">
                        {unlinking ? (
                          <Loader2 className="h-4 w-4 animate-spin text-accent-danger" />
                        ) : (
                          <Unlink className="h-4 w-4 text-accent-danger" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-accent-danger">Desvincular Canvas</p>
                        <p className="text-2xs text-surface-500 mt-0.5">Tendrás que reconectar tu token</p>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Preferences section */}
          <motion.div variants={fadeUp} className="mb-3">
            <SectionLabel>Preferencias</SectionLabel>
            <div className="card overflow-hidden divide-y divide-white/[0.04]">
              <SettingRow
                icon={notifPermission === "granted" ? Bell : BellOff}
                label="Notificaciones"
                description={
                  notifPermission === "granted"
                    ? "Recibirás alertas de entregas y notas"
                    : notifPermission === "denied"
                    ? "Bloqueadas — actívalas en ajustes del navegador"
                    : "Activa para no perderte nada"
                }
                value={
                  notifPermission === "granted" ? (
                    <StatusBadge type="success" label="Activadas" />
                  ) : notifPermission === "denied" ? (
                    <StatusBadge type="warning" label="Bloqueadas" />
                  ) : (
                    <span className="rounded-lg bg-brand-600 px-2.5 py-1 text-2xs font-medium text-white">
                      Activar
                    </span>
                  )
                }
                onClick={notifPermission !== "granted" ? handleRequestNotifications : undefined}
              />
              <SettingRow
                icon={connectionStatus === "disconnected" ? WifiOff : Wifi}
                label="Conexión"
                description="Estado del servidor en tiempo real"
                value={
                  connectionStatus === "connected" ? (
                    <StatusBadge type="success" label="Conectado" />
                  ) : connectionStatus === "connecting" ? (
                    <StatusBadge type="info" label="Conectando..." />
                  ) : (
                    <StatusBadge type="warning" label="Desconectado" />
                  )
                }
              />
            </div>
          </motion.div>

          {/* About section */}
          <motion.div variants={fadeUp} className="mb-3">
            <SectionLabel>Acerca de</SectionLabel>
            <div className="card overflow-hidden p-4">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="" className="h-11 w-11 rounded-xl" />
                <div>
                  <p className="font-display text-sm font-bold text-white">adiutask</p>
                  <p className="text-2xs text-surface-500">v1.0 · Tu asistente académico</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <InfoChip icon={Shield} label="Datos seguros" />
                <InfoChip icon={Info} label="Hecho en la UFV" />
              </div>
            </div>
          </motion.div>

          {/* Logout */}
          <motion.div variants={fadeUp} className="mb-6">
            <motion.button
              type="button"
              onClick={logout}
              whileTap={{ scale: 0.97 }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-accent-danger/20 bg-accent-danger/5 py-3.5 text-sm font-medium text-accent-danger transition-colors hover:bg-accent-danger/10"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </motion.button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 ml-1 text-2xs font-medium uppercase tracking-wider text-surface-500">
      {children}
    </p>
  );
}

interface SettingRowProps {
  icon: React.ElementType;
  label: string;
  description?: string;
  value?: React.ReactNode;
  onClick?: () => void;
}

function SettingRow({ icon: Icon, label, description, value, onClick }: SettingRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
        onClick ? "hover:bg-surface-800/50 active:bg-surface-800" : ""
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-800">
        <Icon className="h-4 w-4 text-surface-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-surface-100">{label}</p>
        {description && <p className="text-2xs text-surface-500 mt-0.5">{description}</p>}
      </div>
      {value && <div className="shrink-0">{value}</div>}
      {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-surface-600" />}
    </button>
  );
}

function StatusBadge({ type, label }: { type: "success" | "warning" | "info" | "muted"; label: string }) {
  const styles = {
    success: "bg-accent-success/10 text-accent-success",
    warning: "bg-accent-warning/10 text-accent-warning",
    info: "bg-accent-info/10 text-accent-info",
    muted: "bg-surface-800 text-surface-500",
  };
  const icons = {
    success: CheckCircle,
    warning: XCircle,
    info: Loader2,
    muted: XCircle,
  };
  const BadgeIcon = icons[type];

  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-2xs font-medium ${styles[type]}`}>
      <BadgeIcon className={`h-3 w-3 ${type === "info" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

function InfoChip({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-800/80 px-2.5 py-1.5 text-2xs text-surface-400">
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
