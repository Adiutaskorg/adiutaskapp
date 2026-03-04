import { motion } from "framer-motion";
import { User, Link2, Bell, LogOut, ChevronRight, CheckCircle, XCircle } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { useChatStore } from "@/stores/chat.store";

interface SettingRowProps {
  icon: React.ElementType;
  label: string;
  value?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}

function SettingRow({ icon: Icon, label, value, onClick, danger }: SettingRowProps) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors ${
        onClick ? "active:bg-surface-800" : ""
      } ${danger ? "text-accent-danger" : ""}`}
    >
      <Icon className={`h-4.5 w-4.5 shrink-0 ${danger ? "text-accent-danger" : "text-surface-400"}`} />
      <span className={`flex-1 text-sm ${danger ? "text-accent-danger" : "text-surface-100"}`}>
        {label}
      </span>
      {value && <span className="text-xs text-surface-400">{value}</span>}
      {onClick && !danger && <ChevronRight className="h-4 w-4 text-surface-600" />}
    </button>
  );
}

export function SettingsView() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isConnected = useChatStore((s) => s.isConnected);

  const initials = user?.name
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "?";

  const hasCanvas = !!user?.canvasUserId;

  return (
    <div className="scrollbar-hidden h-full overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-lg">
        {/* Profile header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col items-center"
        >
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand-600/20 text-xl font-semibold text-brand-300">
            {initials}
          </div>
          <h2 className="font-display text-lg font-bold text-white">{user?.name}</h2>
          <p className="text-sm text-surface-400">{user?.email}</p>
        </motion.div>

        {/* Sections */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-2"
        >
          {/* Account section */}
          <div className="card overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <span className="text-2xs font-medium uppercase tracking-wider text-surface-500">
                Cuenta
              </span>
            </div>
            <SettingRow icon={User} label="Perfil" value={user?.name} />
            <SettingRow
              icon={Link2}
              label="Canvas LMS"
              value={
                hasCanvas ? (
                  <span className="flex items-center gap-1 text-accent-success">
                    <CheckCircle className="h-3 w-3" />
                    Vinculado
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-surface-500">
                    <XCircle className="h-3 w-3" />
                    No vinculado
                  </span>
                )
              }
            />
          </div>

          {/* App section */}
          <div className="card overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <span className="text-2xs font-medium uppercase tracking-wider text-surface-500">
                Aplicación
              </span>
            </div>
            <SettingRow
              icon={Bell}
              label="Notificaciones"
              value={
                Notification.permission === "granted"
                  ? "Activadas"
                  : "Desactivadas"
              }
            />
            <SettingRow
              icon={Link2}
              label="Conexión"
              value={
                isConnected ? (
                  <span className="text-accent-success">Conectado</span>
                ) : (
                  <span className="text-accent-warning">Desconectado</span>
                )
              }
            />
          </div>

          {/* Logout */}
          <div className="card overflow-hidden">
            <SettingRow
              icon={LogOut}
              label="Cerrar sesión"
              onClick={logout}
              danger
            />
          </div>
        </motion.div>

        <p className="mt-6 text-center text-2xs text-surface-600">
          adiutask v1.0 · Hecho con cariño en la UFV
        </p>
      </div>
    </div>
  );
}
