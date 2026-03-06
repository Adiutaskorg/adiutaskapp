// ============================================
// Dashboard Routes
// Aggregated academic data for the dashboard view
// ============================================

import { CanvasClient } from "@adiutask/core";
import type { Assignment } from "@adiutask/core";
import { getUserCanvasToken, getRoutingStats } from "../db/database";

const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL || "https://ufv-es.instructure.com";

// ---- Assignment filtering ----

/** Generic name patterns to exclude (informational, not real assignments) */
const EXCLUDED_NAME_PATTERNS = [
  /gu[ií]a docente/i,
  /programa/i,
  /informaci[oó]n general/i,
  /bienvenid[oa]/i,
  /presentaci[oó]n/i,
  /normativa/i,
  /bibliograf[ií]a/i,
  /metodolog[ií]a/i,
  /criterios de evaluaci[oó]n/i,
  /planificaci[oó]n/i,
  /recursos/i,
  /foro de dudas/i,
  /tablero/i,
];

/** Submission types that indicate a real deliverable */
const REAL_SUBMISSION_TYPES = new Set([
  "online_upload",
  "online_text_entry",
  "online_quiz",
  "online_url",
  "media_recording",
  "student_annotation",
  "external_tool",
]);

/** Filter out non-relevant assignments (templates, informational, unpublished, etc.) */
function isRelevantAssignment(a: Assignment): boolean {
  // Exclude unpublished
  if (!a.published) return false;

  // Exclude submission_types: ["none"] or ["on_paper"] with no due date
  const types = a.submission_types;
  if (types.length === 1 && (types[0] === "none" || types[0] === "on_paper") && !a.due_at) {
    return false;
  }

  // Exclude assignments with ONLY non-deliverable types and no points
  const hasRealType = types.some((t) => REAL_SUBMISSION_TYPES.has(t));
  if (!hasRealType && !a.due_at && (a.points_possible === null || a.points_possible === 0)) {
    return false;
  }

  // Exclude names matching generic patterns
  const name = a.name.trim();
  if (EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(name))) {
    return false;
  }

  return true;
}

export async function dashboardRoutes(
  req: Request,
  url: URL,
  userId: string
): Promise<Response> {
  // Routing stats endpoint (admin-only via query param)
  if (url.pathname === "/api/dashboard/routing-stats") {
    const days = Number(url.searchParams.get("days")) || 1;
    const stats = getRoutingStats(days);
    const total = stats.total || 1;
    return json({
      ...stats,
      byTierPercent: Object.fromEntries(
        Object.entries(stats.byTier).map(([k, v]) => [k, `${((v / total) * 100).toFixed(1)}%`]),
      ),
    });
  }

  if (req.method !== "GET") {
    return json({ error: "Metodo no permitido" }, 405);
  }

  try {
    const canvasToken = await getUserCanvasToken(userId);

    // No Canvas token -> return empty dashboard
    if (!canvasToken) {
      return json({
        linked: false,
        courseCount: 0,
        pendingCount: 0,
        upcomingAssignments: [],
        recentGrades: [],
      });
    }

    // Fetch real data from Canvas
    const canvas = new CanvasClient(CANVAS_BASE_URL, canvasToken);
    const courses = await canvas.getCourses();

    const now = new Date();
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    // Fetch pending assignments across all courses (parallel)
    const assignmentResults = await Promise.allSettled(
      courses.map(async (c) => {
        const assignments = await canvas.getAssignments(c.id, false);
        return assignments
          .filter(isRelevantAssignment)
          .filter((a) => {
            if (!a.due_at) return false;
            const dueDate = new Date(a.due_at);
            // Exclude absurd dates (> 1 year away)
            if (dueDate > oneYearFromNow) return false;
            return true;
          })
          .map((a) => {
            const isOverdue = new Date(a.due_at!) < now;
            return {
              id: String(a.id),
              name: a.name,
              courseName: c.name,
              dueAt: a.due_at!,
              status: isOverdue ? ("overdue" as const) : ("upcoming" as const),
            };
          });
      })
    );

    type DashAssignment = {
      id: string;
      name: string;
      courseName: string;
      dueAt: string;
      status: "overdue" | "upcoming";
    };
    const allAssignments: DashAssignment[] = assignmentResults
      .filter(
        (r): r is PromiseFulfilledResult<DashAssignment[]> =>
          r.status === "fulfilled"
      )
      .flatMap((r) => r.value);

    // Sort by due date (nearest first)
    allAssignments.sort(
      (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    );

    // Fetch grades (parallel) — current_score is Canvas's weighted percentage (0-100)
    const gradeResults = await Promise.allSettled(
      courses.map(async (c) => {
        const grades = await canvas.getGrades(c.id);
        if (
          grades.current_score !== null &&
          grades.current_score >= 0 &&
          grades.current_score <= 100
        ) {
          // Convert percentage to /10 scale (standard in Spanish universities)
          const scoreOver10 =
            Math.round((grades.current_score / 10) * 10) / 10; // one decimal
          return {
            courseName: grades.course_name || c.name,
            assignmentName: "Nota actual",
            score: scoreOver10,
            maxScore: 10,
          };
        }
        return null;
      })
    );

    type DashGrade = {
      courseName: string;
      assignmentName: string;
      score: number;
      maxScore: number;
    };
    const recentGrades: DashGrade[] = gradeResults
      .filter(
        (r): r is PromiseFulfilledResult<DashGrade> =>
          r.status === "fulfilled" && r.value !== null
      )
      .map((r) => r.value);

    // Compute average grade over 10 (server-side to avoid frontend miscalculations)
    const avgGradeOver10 =
      recentGrades.length > 0
        ? Math.round(
            (recentGrades.reduce((sum, g) => sum + g.score, 0) /
              recentGrades.length) *
              10
          ) / 10
        : null;

    return json({
      linked: true,
      courseCount: courses.length,
      pendingCount: allAssignments.filter((a) => a.status === "upcoming")
        .length,
      upcomingAssignments: allAssignments.slice(0, 10),
      recentGrades,
      avgGradeOver10,
    });
  } catch (err) {
    console.error("[Dashboard] Error:", err);
    return json({ error: "Error al cargar datos del dashboard" }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
