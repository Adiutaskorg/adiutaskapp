import { Outlet, NavLink } from "react-router-dom";
import { MessageCircle, LayoutDashboard, LogOut, Wifi, WifiOff } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { useChatStore } from "@/stores/chat.store";

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isConnected = useChatStore((s) => s.isConnected);

  return (
    <div className="flex h-[100dvh] flex-col bg-surface-950">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-white/5 bg-surface-900/80 px-4 py-3 pt-safe backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 font-display text-sm font-bold">
            U
          </div>
          <div>
            <h1 className="font-display text-sm font-semibold text-white">UniBot</h1>
            <div className="flex items-center gap-1.5">
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3 text-accent-success" />
                  <span className="text-2xs text-accent-success">Conectado</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-accent-warning" />
                  <span className="text-2xs text-accent-warning">Reconectando...</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user && (
            <span className="hidden text-xs text-surface-200 sm:block">
              {user.name}
            </span>
          )}
          <button
            onClick={logout}
            className="rounded-lg p-2 text-surface-200 transition-colors hover:bg-surface-800 hover:text-white"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>

      {/* Bottom navigation (mobile-friendly) */}
      <nav className="flex border-t border-white/5 bg-surface-900/80 pb-safe backdrop-blur-lg">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors ${
              isActive ? "text-brand-400" : "text-surface-200 hover:text-white"
            }`
          }
        >
          <MessageCircle className="h-5 w-5" />
          <span>Chat</span>
        </NavLink>
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors ${
              isActive ? "text-brand-400" : "text-surface-200 hover:text-white"
            }`
          }
        >
          <LayoutDashboard className="h-5 w-5" />
          <span>Panel</span>
        </NavLink>
      </nav>
    </div>
  );
}
