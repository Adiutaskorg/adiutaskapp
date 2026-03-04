import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth.store";
import {
  BookOpen,
  ClipboardList,
  Calendar,
  TrendingUp,
  ChevronRight,
  Clock,
  AlertTriangle,
} from "lucide-react";

// Placeholder types — these will come from the API
interface DashboardData {
  upcomingAssignments: Array<{
    id: string;
    name: string;
    courseName: string;
    dueAt: string;
    status: "upcoming" | "overdue";
  }>;
  recentGrades: Array<{
    courseName: string;
    assignmentName: string;
    score: number;
    maxScore: number;
  }>;
  courseCount: number;
  pendingCount: number;
}

export function DashboardView() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch("/api/dashboard", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error("Dashboard fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, [token]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="scrollbar-hidden h-full overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-2xl">
        {/* Greeting */}
        <div className="mb-6">
          <h2 className="font-display text-xl font-bold text-white">
            Hola, {user?.name?.split(" ")[0]} 👋
          </h2>
          <p className="mt-1 text-sm text-surface-200/60">
            Aquí tienes tu resumen académico
          </p>
        </div>

        {/* Stats grid */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <StatCard
            icon={BookOpen}
            label="Cursos activos"
            value={data?.courseCount ?? 0}
            color="brand"
          />
          <StatCard
            icon={ClipboardList}
            label="Entregas pendientes"
            value={data?.pendingCount ?? 0}
            color="warning"
          />
        </div>

        {/* Upcoming assignments */}
        <section className="mb-6">
          <SectionHeader icon={Calendar} title="Próximas entregas" />
          <div className="mt-3 space-y-2">
            {data?.upcomingAssignments.length ? (
              data.upcomingAssignments.map((a) => (
                <div
                  key={a.id}
                  className="glass-card flex items-center gap-3 p-3"
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      a.status === "overdue"
                        ? "bg-accent-danger/10"
                        : "bg-accent-info/10"
                    }`}
                  >
                    {a.status === "overdue" ? (
                      <AlertTriangle className="h-4 w-4 text-accent-danger" />
                    ) : (
                      <Clock className="h-4 w-4 text-accent-info" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {a.name}
                    </p>
                    <p className="text-2xs text-surface-200/50">{a.courseName}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-surface-200">
                      {new Date(a.dueAt).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                    <p className="text-2xs text-surface-200/40">
                      {new Date(a.dueAt).toLocaleTimeString("es-ES", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState text="No tienes entregas próximas" />
            )}
          </div>
        </section>

        {/* Recent grades */}
        <section>
          <SectionHeader icon={TrendingUp} title="Últimas calificaciones" />
          <div className="mt-3 space-y-2">
            {data?.recentGrades.length ? (
              data.recentGrades.map((g, i) => (
                <div key={i} className="glass-card flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {g.assignmentName}
                    </p>
                    <p className="text-2xs text-surface-200/50">{g.courseName}</p>
                  </div>
                  <div className="shrink-0 font-mono text-sm font-medium">
                    <span
                      className={
                        g.score / g.maxScore >= 0.5
                          ? "text-accent-success"
                          : "text-accent-danger"
                      }
                    >
                      {g.score}
                    </span>
                    <span className="text-surface-200/40">/{g.maxScore}</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState text="Sin calificaciones recientes" />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// --- Sub-components ---

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number;
  color: "brand" | "warning";
}) {
  return (
    <div className="glass-card p-4">
      <Icon
        className={`mb-2 h-5 w-5 ${
          color === "brand" ? "text-brand-400" : "text-accent-warning"
        }`}
      />
      <p className="font-display text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-surface-200/50">{label}</p>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: typeof Calendar;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand-400" />
        <h3 className="font-display text-sm font-semibold text-white">{title}</h3>
      </div>
      <ChevronRight className="h-4 w-4 text-surface-200/30" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
      <p className="text-xs text-surface-200/40">{text}</p>
    </div>
  );
}
