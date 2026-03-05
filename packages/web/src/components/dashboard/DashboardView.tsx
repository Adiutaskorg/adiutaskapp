import { useState, useEffect, useRef, useCallback } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { useAuthStore } from "@/stores/auth.store";
import { API_BASE } from "@/lib/api";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  ClipboardList,
  TrendingUp,
  Calendar,
  Clock,
  AlertTriangle,
  Timer,
  RefreshCw,
  Inbox,
  FileQuestion,
  Link2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";

interface DashboardData {
  linked?: boolean;
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
  show: { transition: { staggerChildren: 0.07 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } },
};

export function DashboardView() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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

  // Pull-to-refresh
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

  const nextDeadline = (data?.upcomingAssignments ?? [])
    .filter((a) => a.status === "upcoming")
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];

  const avgGrade = data?.recentGrades?.length
    ? Math.round(
        data.recentGrades.reduce((sum, g) => sum + (g.score / g.maxScore) * 100, 0) /
          data.recentGrades.length
      )
    : null;

  return (
    <div
      ref={scrollRef}
      className="scrollbar-hidden h-full overflow-y-auto px-4 py-5"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      <motion.div style={{ opacity: pullOpacity }} className="flex justify-center pb-3">
        <motion.div style={{ rotate: pullRotate }}>
          <RefreshCw className={`h-5 w-5 text-brand-400 ${refreshing ? "animate-spin" : ""}`} />
        </motion.div>
      </motion.div>

      <div className="mx-auto max-w-2xl">
        {loading ? (
          <DashboardSkeleton />
        ) : error ? (
          <ErrorState onRetry={() => fetchDashboard()} />
        ) : (
          <motion.div variants={stagger} initial="hidden" animate="show">
            {/* Greeting banner */}
            <motion.div variants={fadeUp} className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-bold text-white">
                  {getGreeting()}, {firstName}
                </h2>
                <p className="mt-0.5 text-sm capitalize text-surface-400">{todayFormatted}</p>
              </div>
              <motion.button
                type="button"
                onClick={handleRefresh}
                whileTap={{ scale: 0.9, rotate: 180 }}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-800 text-surface-400 transition-colors hover:bg-surface-700 hover:text-brand-400"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              </motion.button>
            </motion.div>

            {/* Canvas not linked prompt */}
            {data?.linked === false && (
              <motion.div variants={fadeUp} className="mb-5">
                <div className="card overflow-hidden">
                  <div className="h-1 bg-gradient-to-r from-brand-500 to-brand-400" />
                  <div className="p-4 flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/15">
                      <Link2 className="h-5 w-5 text-brand-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-100">Conecta tu Canvas</p>
                      <p className="text-2xs text-surface-500 mt-0.5">Vincula tu cuenta para ver notas, entregas y cursos</p>
                    </div>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => navigate("/settings")}
                      className="shrink-0 rounded-xl bg-brand-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-500"
                    >
                      Vincular
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Stats grid */}
            <motion.div variants={fadeUp} className="mb-5 grid grid-cols-2 gap-2.5">
              <StatCard icon={BookOpen} label="Cursos activos" value={data?.courseCount ?? 0} color="brand" />
              <StatCard icon={ClipboardList} label="Pendientes" value={data?.pendingCount ?? 0} color="warning" />
              <StatCard icon={TrendingUp} label="Media" value={avgGrade !== null ? `${avgGrade}%` : "—"} color="success" />
              <StatCard
                icon={Timer}
                label="Próximo deadline"
                value={nextDeadline ? formatDistanceToNow(new Date(nextDeadline.dueAt), { locale: es }) : "—"}
                color="info"
                small
              />
            </motion.div>

            {/* Deadline countdown */}
            {nextDeadline && (
              <motion.div variants={fadeUp} className="mb-5">
                <DeadlineCountdown assignment={nextDeadline} />
              </motion.div>
            )}

            {/* Upcoming assignments */}
            <motion.section variants={fadeUp} className="mb-5">
              <SectionHeader
                icon={Calendar}
                title="Próximas entregas"
                count={data?.upcomingAssignments.length}
              />
              <div className="mt-3 space-y-2">
                {data?.upcomingAssignments.length ? (
                  data.upcomingAssignments.map((a) => (
                    <motion.div
                      key={a.id}
                      variants={fadeUp}
                      whileTap={{ scale: 0.98 }}
                      className={`card flex items-center gap-3 border-l-2 p-3.5 transition-colors hover:bg-surface-800/80 ${
                        a.status === "overdue" ? "border-l-accent-danger" : "border-l-brand-400"
                      }`}
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          a.status === "overdue" ? "bg-accent-danger/10" : "bg-brand-500/10"
                        }`}
                      >
                        {a.status === "overdue" ? (
                          <AlertTriangle className="h-4.5 w-4.5 text-accent-danger" />
                        ) : (
                          <Clock className="h-4.5 w-4.5 text-brand-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-surface-100">{a.name}</p>
                        <p className="text-2xs text-surface-500">{a.courseName}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-lg px-2 py-1 text-2xs font-medium ${
                          a.status === "overdue"
                            ? "bg-accent-danger/10 text-accent-danger"
                            : "bg-brand-500/10 text-brand-400"
                        }`}
                      >
                        {formatDistanceToNow(new Date(a.dueAt), { addSuffix: true, locale: es })}
                      </span>
                    </motion.div>
                  ))
                ) : (
                  <EmptyState icon={Inbox} text="No tienes entregas próximas" subtitle="Disfruta del tiempo libre" />
                )}
              </div>
            </motion.section>

            {/* Recent grades */}
            <motion.section variants={fadeUp} className="pb-4">
              <SectionHeader
                icon={TrendingUp}
                title="Últimas calificaciones"
                count={data?.recentGrades.length}
              />
              <div className="mt-3 space-y-2">
                {data?.recentGrades.length ? (
                  data.recentGrades.map((g, i) => {
                    const pct = Math.round((g.score / g.maxScore) * 100);
                    const barColor =
                      pct >= 80 ? "bg-accent-success" : pct >= 50 ? "bg-accent-warning" : "bg-accent-danger";
                    const textColor =
                      pct >= 80 ? "text-accent-success" : pct >= 50 ? "text-accent-warning" : "text-accent-danger";

                    return (
                      <motion.div key={i} variants={fadeUp} className="card p-3.5">
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="min-w-0 flex-1 mr-3">
                            <p className="truncate text-sm font-medium text-surface-100">{g.assignmentName}</p>
                            <p className="text-2xs text-surface-500">{g.courseName}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-sm font-medium text-surface-300">
                              {g.score}<span className="text-surface-600">/{g.maxScore}</span>
                            </span>
                            <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${textColor} bg-current/10`}>
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-800">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ delay: 0.2 + i * 0.1, duration: 0.6, ease: "easeOut" }}
                            className={`h-full rounded-full ${barColor}`}
                          />
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <EmptyState icon={FileQuestion} text="Sin calificaciones recientes" subtitle="Aparecerán aquí cuando las publiquen" />
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
  const styles = {
    brand: { icon: "bg-brand-500/15 text-brand-400", value: "text-brand-300" },
    warning: { icon: "bg-accent-warning/15 text-accent-warning", value: "text-accent-warning" },
    success: { icon: "bg-accent-success/15 text-accent-success", value: "text-accent-success" },
    info: { icon: "bg-accent-info/15 text-accent-info", value: "text-accent-info" },
  };

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles[color].icon}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className={`font-display font-bold text-white ${small ? "text-lg" : "text-2xl"}`}>
          {value}
        </p>
        <p className="text-2xs text-surface-500 mt-0.5">{label}</p>
      </div>
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
  const progress = Math.max(0, Math.min(100, (diffHours / (7 * 24)) * 100));

  return (
    <div
      className={`card overflow-hidden ${
        isUrgent ? "ring-1 ring-accent-danger/20" : ""
      }`}
    >
      {/* Gradient top bar */}
      <div className={`h-1 ${isUrgent ? "bg-accent-danger" : "bg-gradient-to-r from-brand-500 to-brand-400"}`} />

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              isUrgent ? "bg-accent-danger/10" : "bg-brand-500/10"
            }`}>
              <Timer className={`h-4 w-4 ${isUrgent ? "text-accent-danger" : "text-brand-400"}`} />
            </div>
            <span className="text-xs font-medium text-surface-400">Próximo deadline</span>
          </div>

          {/* Countdown */}
          <div className="flex items-baseline gap-1 text-right">
            {diffDays > 0 && (
              <>
                <span className={`font-display text-2xl font-bold ${isUrgent ? "text-accent-danger" : "text-white"}`}>
                  {diffDays}
                </span>
                <span className="text-xs text-surface-400 mr-1.5">d</span>
              </>
            )}
            <span className={`font-display text-2xl font-bold ${isUrgent ? "text-accent-danger" : "text-white"}`}>
              {remainingHours}
            </span>
            <span className="text-xs text-surface-400">h</span>
          </div>
        </div>

        <p className="text-sm font-medium text-surface-100 mb-0.5">{assignment.name}</p>
        <p className="text-2xs text-surface-500 mb-3">{assignment.courseName}</p>

        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-800">
          <motion.div
            initial={{ width: "100%" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`h-full rounded-full ${isUrgent ? "bg-accent-danger" : "bg-brand-500"}`}
          />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof Calendar;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-brand-400" />
      <h3 className="font-display text-sm font-semibold text-white">{title}</h3>
      {count !== undefined && count > 0 && (
        <span className="rounded-md bg-surface-800 px-1.5 py-0.5 text-2xs font-medium text-surface-400">
          {count}
        </span>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, text, subtitle }: { icon: typeof Inbox; text: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/[0.08] py-10 text-center">
      <Icon className="h-6 w-6 text-surface-600" />
      <p className="text-sm font-medium text-surface-400">{text}</p>
      {subtitle && <p className="text-2xs text-surface-600">{subtitle}</p>}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center gap-4 py-20 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-danger/10">
        <AlertTriangle className="h-7 w-7 text-accent-danger" />
      </div>
      <div>
        <p className="font-display text-base font-semibold text-white">No se pudo cargar el panel</p>
        <p className="mt-1 text-sm text-surface-400">Comprueba tu conexión e inténtalo de nuevo.</p>
      </div>
      <motion.button
        onClick={onRetry}
        whileTap={{ scale: 0.95 }}
        className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-500"
      >
        <RefreshCw className="h-4 w-4" />
        Reintentar
      </motion.button>
    </motion.div>
  );
}
