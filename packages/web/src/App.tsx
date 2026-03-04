import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store";
import { AppLayout } from "@/components/layout/AppLayout";
import { ChatView } from "@/components/chat/ChatView";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { LoginView } from "@/components/auth/LoginView";
import { useNotifications } from "@/hooks/useNotifications";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-surface-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const restoreSession = useAuthStore((s) => s.restoreSession);

  // Restore session on mount
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Push notifications (only when authenticated)
  useNotifications({ enabled: isAuthenticated });

  return (
    <Routes>
      <Route path="/login" element={<LoginView />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ChatView />} />
        <Route path="dashboard" element={<DashboardView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
