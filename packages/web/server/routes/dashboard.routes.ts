// ============================================
// Dashboard Routes
// Aggregated academic data for the dashboard view
// ============================================

import { CanvasClient } from "@adiutask/core";
import { getUserCanvasToken } from "../db/database";

const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL || "https://ufv-es.instructure.com";

export async function dashboardRoutes(
  req: Request,
  url: URL,
  userId: string
): Promise<Response> {
  if (req.method !== "GET") {
    return json({ error: "Método no permitido" }, 405);
  }

  try {
    const canvasToken = await getUserCanvasToken(userId);

    // No Canvas token → return empty dashboard
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

    // Fetch pending assignments across all courses (parallel)
    const assignmentResults = await Promise.allSettled(
      courses.map(async (c) => {
        const assignments = await canvas.getAssignments(c.id, true);
        return assignments.map((a) => {
          const isOverdue = a.due_at && new Date(a.due_at) < new Date();
          return {
            id: String(a.id),
            name: a.name,
            courseName: c.name,
            dueAt: a.due_at,
            status: isOverdue ? "overdue" as const : "upcoming" as const,
          };
        });
      })
    );
    type DashAssignment = { id: string; name: string; courseName: string; dueAt: string | null; status: "overdue" | "upcoming" };
    const allAssignments: DashAssignment[] = assignmentResults
      .filter((r): r is PromiseFulfilledResult<DashAssignment[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);

    // Sort by due date
    allAssignments.sort((a: DashAssignment, b: DashAssignment) => {
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });

    // Fetch grades (parallel)
    const gradeResults = await Promise.allSettled(
      courses.map(async (c) => {
        const grades = await canvas.getGrades(c.id);
        if (grades.current_score !== null) {
          return {
            courseName: grades.course_name || c.name,
            assignmentName: "Nota actual",
            score: grades.current_score,
            maxScore: 10,
          };
        }
        return null;
      })
    );
    type DashGrade = { courseName: string; assignmentName: string; score: number; maxScore: number };
    const recentGrades: DashGrade[] = gradeResults
      .filter((r): r is PromiseFulfilledResult<DashGrade> =>
        r.status === "fulfilled" && r.value !== null)
      .map((r) => r.value);

    return json({
      linked: true,
      courseCount: courses.length,
      pendingCount: allAssignments.filter((a: DashAssignment) => a.status === "upcoming").length,
      upcomingAssignments: allAssignments.slice(0, 10),
      recentGrades,
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
