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
    const now = new Date();
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

    const assignmentResults = await Promise.allSettled(
      courses.map(async (c) => {
        const assignments = await canvas.getAssignments(c.id, true);
        return assignments
          .filter((a) => {
            // Skip assignments without due date
            if (!a.due_at) return false;
            // Skip assignments with absurd due dates (> 6 months away)
            const dueDate = new Date(a.due_at);
            if (dueDate > sixMonthsFromNow) return false;
            return true;
          })
          .map((a) => {
            const isOverdue = new Date(a.due_at!) < now;
            return {
              id: String(a.id),
              name: a.name,
              courseName: c.name,
              dueAt: a.due_at!,
              status: isOverdue ? "overdue" as const : "upcoming" as const,
            };
          });
      })
    );
    type DashAssignment = { id: string; name: string; courseName: string; dueAt: string; status: "overdue" | "upcoming" };
    const allAssignments: DashAssignment[] = assignmentResults
      .filter((r): r is PromiseFulfilledResult<DashAssignment[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);

    // Sort by due date (nearest first)
    allAssignments.sort((a: DashAssignment, b: DashAssignment) =>
      new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    );

    // Fetch grades (parallel)
    const gradeResults = await Promise.allSettled(
      courses.map(async (c) => {
        const grades = await canvas.getGrades(c.id);
        // current_score is already a percentage (0-100) from Canvas
        // Convert to /10 scale (standard in Spanish universities)
        if (grades.current_score !== null && grades.current_score >= 0 && grades.current_score <= 100) {
          return {
            courseName: grades.course_name || c.name,
            assignmentName: "Nota actual",
            score: Math.round(grades.current_score) / 10,
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
