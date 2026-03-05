import { useCallback } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { MessageCircle, LayoutDashboard, Settings } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { useAuthStore } from "@/stores/auth.store";
import { useChatStore } from "@/stores/chat.store";
import { useWebSocket } from "@/hooks/useWebSocket";

const NAV_ITEMS = [
  { to: "/", label: "Chat", icon: MessageCircle, end: true },
  { to: "/dashboard", label: "Panel", icon: LayoutDashboard, end: false },
  { to: "/settings", label: "Ajustes", icon: Settings, end: false },
] as const;

const SWIPE_ROUTES = ["/", "/dashboard", "/settings"];

/** Trigger a short haptic vibration on supported devices */
function haptic(duration = 10) {
  if (navigator.vibrate) {
    navigator.vibrate(duration);
  }
}

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isConnected = useChatStore((s) => s.isConnected);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const location = useLocation();
  const navigate = useNavigate();

  // WebSocket lives here so the connection persists across all tabs
  const { sendMessage } = useWebSocket({ enabled: isAuthenticated });

  const handleLogoClick = useCallback(() => {
    haptic(6);
    clearMessages();
    navigate("/");
  }, [clearMessages, navigate]);

  const initials = user?.name
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "?";

  const currentIndex = SWIPE_ROUTES.indexOf(location.pathname);
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-100, 0, 100], [0.5, 1, 0.5]);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const threshold = 60;
      const velocity = 300;

      if (
        (info.offset.x < -threshold || info.velocity.x < -velocity) &&
        currentIndex < SWIPE_ROUTES.length - 1
      ) {
        haptic();
        navigate(SWIPE_ROUTES[currentIndex + 1]);
      } else if (
        (info.offset.x > threshold || info.velocity.x > velocity) &&
        currentIndex > 0
      ) {
        haptic();
        navigate(SWIPE_ROUTES[currentIndex - 1]);
      }
    },
    [currentIndex, navigate]
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-surface-950">
      {/* Top bar — minimal */}
      <header className="flex items-center justify-between border-b border-white/[0.06] bg-surface-900/80 px-4 py-2.5 pt-safe backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={handleLogoClick} className="flex items-center gap-2 transition-opacity active:opacity-70">
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-xl" />
            <span className="font-display text-base font-bold bg-gradient-to-r from-cream-50 to-brand-300 bg-clip-text text-transparent">
              adiutask
            </span>
          </button>
          <div
            className={`h-2 w-2 rounded-full transition-colors ${
              isConnected ? "bg-accent-success" : "bg-accent-warning animate-pulse-soft"
            }`}
            title={isConnected ? "Conectado" : "Reconectando..."}
          />
        </div>

        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600/20 text-xs font-medium text-brand-300"
          title={user?.name ?? ""}
        >
          {initials}
        </div>
      </header>

      {/* Main content with swipe */}
      <main className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            style={{ x, opacity }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="h-full"
          >
            <Outlet context={{ sendMessage }} />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom navigation */}
      <nav className="flex border-t border-white/[0.06] bg-surface-900/80 pb-safe backdrop-blur-xl">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => haptic(6)}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
                isActive ? "text-brand-400" : "text-surface-500 active:text-surface-300"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -top-px left-1/4 right-1/4 h-0.5 rounded-full bg-brand-500"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
