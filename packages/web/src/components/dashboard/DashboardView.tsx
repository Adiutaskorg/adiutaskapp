import { useState, useEffect, useRef, useCallback } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { useAuthStore } from "@/stores/auth.store";
import { API_BASE } from "@/lib/api";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import {
  BookOpen,
  ClipboardList,
  TrendingUp,
  Calendar,
  Clock,
  AlertTriangle,
  Timer,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";

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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export function DashboardView() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchDashboard = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError(false);
    try {
      const res = await fetch(`${API_BASE}/api/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setData(await res.json());
      } else {
        setError(true);
      }
    } catch (err) {
      console.error("[Dashboard] Error al cargar:", err);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    if (navigator.vibrate) navigator.vibrate(10);
    fetchDashboard(false);
  }, [fetchDashboard]);

  // Pull-to-refresh via touch
  const pullY = useMotionValue(0);
  const pullOpacity = useTransform(pullY, [0, 60], [0, 1]);
  const pullRotate = useTransform(pullY, [0, 60], [0, 360]);
  const startY = useRef(0);
  const pulling = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current) return;
    const delta = Math.max(0, Math.min(80, e.touches[0].clientY - startY.current));
    pullY.set(delta);
  }, [pullY]);

  const handleTouchEnd = useCallback(() => {
    if (pullY.get() > 50 && !refreshing) {
      handleRefresh();
    }
    pullY.set(0);
    pulling.current = false;
  }, [pullY, refreshing, handleRefresh]);

  const firstName = user?.name?.split(" ")[0] ?? "";
  const todayFormatted = format(new Date(), "EEEE, d 'de' MMMM", { locale: es });

  // Find next deadline
  const nextDeadline = (data?.upcomingAssignments ?? [])
    .filter((a) => a.status === "upcoming")
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];

  // Average grade
  const avgGrade = data?.recentGrades?.length
    ? Math.round(
        data.recentGrades.reduce((sum, g) => sum + (g.score / g.maxScore) * 100, 0) /
          data.recentGrades.length
      )
    : null;

  return (
    <div
      ref={scrollRef}
      className="scrollbar-hidden h-full overflow-y-auto px-4 py-6"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      <motion.div
        style={{ opacity: pullOpacity }}
        className="flex justify-center pb-4"
      >
        <motion.div style={{ rotate: pullRotate }}>
          <RefreshCw className={`h-5 w-5 text-brand-400 ${refreshing ? "animate-spin" : ""}`} />
        </motion.div>
      </motion.div>

      <div className="mx-auto max-w-2xl">
        {loading ? (
          <DashboardSkeleton />
        ) : error ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center gap-4 py-20 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-danger/10">
              <AlertTriangle className="h-7 w-7 text-accent-danger" />
            </div>
            <div>
              <p className="font-display text-base font-semibold text-white">
                No se pudo cargar el dashboard
              </p>
              <p className="mt-1 text-sm text-surface-400">
                Comprueba tu conexión e inténtalo de nuevo.
              </p>
            </div>
            <button
              onClick={() => fetchDashboard()}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-500"
            >
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </button>
          </motion.div>
        ) : (
          <motion.div variants={stagger} initial="hidden" animate="show">
            {/* Greeting */}
            <motion.div variants={fadeUp} className="mb-6">
              <h2 className="font-display text-xl font-bold text-white">
                {getGreeting()}, {firstName}
              </h2>
              <p className="mt-0.5 text-sm capitalize text-surface-400">
                {todayFormatted}
              </p>
            </motion.div>

            {/* Stats grid 2x2 */}
            <motion.div variants={fadeUp} className="mb-6 grid grid-cols-2 gap-2.5">
              <StatCard
                icon={BookOpen}
                label="Cursos activos"
                value={data?.courseCount ?? 0}
                color="brand"
              />
              <StatCard
                icon={ClipboardList}
                label="Pendientes"
                value={data?.pendingCount ?? 0}
                color="warning"
              />
              <StatCard
                icon={TrendingUp}
                label="Media"
                value={avgGrade !== null ? `${avgGrade}%` : "—"}
                color="success"
              />
              <StatCard
                icon={Timer}
                label="Próximo deadline"
                value={
                  nextDeadline
                    ? formatDistanceToNow(new Date(nextDeadline.dueAt), { locale: es })
                    : "—"
                }
                color="info"
                small
              />
            </motion.div>

            {/* Deadline countdown */}
            {nextDeadline && (
              <motion.div variants={fadeUp} className="mb-6">
                <DeadlineCountdown assignment={nextDeadline} />
              </motion.div>
            )}

            {/* Upcoming assignments */}
            <motion.section variants={fadeUp} className="mb-6">
              <SectionHeader icon={Calendar} title="Próximas entregas" />
              <div className="mt-3 space-y-2">
                {data?.upcomingAssignments.length ? (
                  data.upcomingAssignments.map((a, i) => (
                    <motion.div
                      key={a.id}
                      variants={fadeUp}
                      className={`card flex items-center gap-3 border-l-2 p-3 ${
                        a.status === "overdue"
                          ? "border-l-accent-danger"
                          : "border-l-accent-info"
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
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
                        <p className="truncate text-sm font-medium text-surface-100">
                          {a.name}
                        </p>
                        <p className="text-2xs text-surface-500">{a.courseName}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-surface-300">
                          {formatDistanceToNow(new Date(a.dueAt), {
                            addSuffix: true,
                            locale: es,
                          })}
                        </p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <EmptyState text="No tienes entregas próximas" />
                )}
              </div>
            </motion.section>

            {/* Recent grades */}
            <motion.section variants={fadeUp}>
              <SectionHeader icon={TrendingUp} title="Últimas calificaciones" />
              <div className="mt-3 space-y-2">
                {data?.recentGrades.length ? (
                  data.recentGrades.map((g, i) => {
                    const pct = Math.round((g.score / g.maxScore) * 100);
                    const barColor =
                      pct >= 80 ? "bg-accent-success" :
                      pct >= 50 ? "bg-accent-warning" :
                      "bg-accent-danger";

                    return (
                      <motion.div key={i} variants={fadeUp} className="card p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-surface-100">
                              {g.assignmentName}
                            </p>
                            <p className="text-2xs text-surface-500">{g.courseName}</p>
                          </div>
                          <div className="shrink-0 font-mono text-sm font-medium">
                            <span
                              className={
                                pct >= 50
                                  ? "text-accent-success"
                                  : "text-accent-danger"
                              }
                            >
                              {g.score}
                            </span>
                            <span className="text-surface-500">/{g.maxScore}</span>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-800">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ delay: 0.3 + i * 0.1, duration: 0.5, ease: "easeOut" }}
                            className={`h-full rounded-full ${barColor}`}
                          />
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <EmptyState text="Sin calificaciones recientes" />
                )}
              </div>
            </motion.section>
          </motion.div>
        )}
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
  small,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number | string;
  color: "brand" | "warning" | "success" | "info";
  small?: boolean;
}) {
  const iconColors = {
    brand: "text-brand-400",
    warning: "text-accent-warning",
    success: "text-accent-success",
    info: "text-accent-info",
  };

  return (
    <div className="card p-4">
      <Icon className={`mb-2 h-4.5 w-4.5 ${iconColors[color]}`} />
      <p className={`font-display font-bold text-white ${small ? "text-lg" : "text-2xl"}`}>
        {value}
      </p>
      <p className="text-2xs text-surface-500">{label}</p>
    </div>
  );
}

function DeadlineCountdown({
  assignment,
}: {
  assignment: { name: string; courseName: string; dueAt: string };
}) {
  const dueDate = new Date(assignment.dueAt);
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;

  const isUrgent = diffHours < 24;

  return (
    <div
      className={`card overflow-hidden p-4 ${
        isUrgent ? "border-accent-danger/30" : "border-white/[0.06]"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Timer className={`h-4 w-4 ${isUrgent ? "text-accent-danger" : "text-brand-400"}`} />
        <span className="text-xs font-medium text-surface-400">Próximo deadline</span>
      </div>
      <p className="text-sm font-medium text-surface-100 mb-1">{assignment.name}</p>
      <p className="text-2xs text-surface-500 mb-3">{assignment.courseName}</p>

      <div className="flex items-baseline gap-1">
        {diffDays > 0 && (
          <>
            <span className={`font-display text-3xl font-bold ${isUrgent ? "text-accent-danger" : "text-white"}`}>
              {diffDays}
            </span>
            <span className="text-sm text-surface-400 mr-2">d</span>
          </>
        )}
        <span className={`font-display text-3xl font-bold ${isUrgent ? "text-accent-danger" : "text-white"}`}>
          {remainingHours}
        </span>
        <span className="text-sm text-surface-400">h</span>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-800">
        <motion.div
          initial={{ width: "100%" }}
          animate={{ width: `${Math.max(0, Math.min(100, (diffHours / (7 * 24)) * 100))}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full rounded-full ${isUrgent ? "bg-accent-danger" : "bg-brand-500"}`}
        />
      </div>
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
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-brand-400" />
      <h3 className="font-display text-sm font-semibold text-white">{title}</h3>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center">
      <p className="text-sm text-surface-500">{text}</p>
    </div>
  );
}
