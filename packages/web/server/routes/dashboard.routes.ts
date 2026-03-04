// ============================================
// Dashboard Routes
// Aggregated academic data for the dashboard view
// ============================================

import { CanvasClient } from "../canvas/client";
import { getUserCanvasToken } from "../db/database";

const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL || "https://ufv-es.instructure.com";

export async function dashboardRoutes(
  req: Request,
  url: URL,
  userId: string
): Promise<Response> {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
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

    // Fetch pending assignments across all courses
    const allAssignments: { id: string; name: string; courseName: string; dueAt: string | null; status: string }[] = [];
    for (const c of courses) {
      try {
        const assignments = await canvas.getAssignments(c.id, true);
        for (const a of assignments) {
          const isOverdue = a.due_at && new Date(a.due_at) < new Date();
          allAssignments.push({
            id: String(a.id),
            name: a.name,
            courseName: c.name,
            dueAt: a.due_at,
            status: isOverdue ? "overdue" : "upcoming",
          });
        }
      } catch {
        // Skip courses with no assignments access
      }
    }

    // Sort by due date
    allAssignments.sort((a, b) => {
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });

    // Fetch grades
    const recentGrades: { courseName: string; assignmentName: string; score: number | null; maxScore: number }[] = [];
    for (const c of courses) {
      try {
        const grades = await canvas.getGrades(c.id);
        if (grades.current_score !== null) {
          recentGrades.push({
            courseName: grades.course_name || c.name,
            assignmentName: "Nota actual",
            score: grades.current_score,
            maxScore: 10,
          });
        }
      } catch {
        // Skip courses without grades
      }
    }

    return json({
      linked: true,
      courseCount: courses.length,
      pendingCount: allAssignments.filter((a) => a.status === "upcoming").length,
      upcomingAssignments: allAssignments.slice(0, 10),
      recentGrades,
    });
  } catch (err) {
    console.error("[Dashboard] Error:", err);
    return json({ error: "Failed to load dashboard data" }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
