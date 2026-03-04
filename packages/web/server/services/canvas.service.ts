// ============================================
// Canvas LMS Service
// Wraps Canvas API calls for a specific user
//
// INTEGRATION POINT: Adapt this to match your
// existing Canvas API integration code.
// ============================================

import { getUserCanvasToken } from "../db/database";

const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL || "https://ufv.instructure.com";

interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  enrollment_term_id: number;
}

export class CanvasService {
  private userId: string;
  private token: string | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  private async getToken(): Promise<string> {
    if (!this.token) {
      this.token = await getUserCanvasToken(this.userId);
      if (!this.token) throw new Error("No Canvas token found for user");
    }
    return this.token;
  }

  private async canvasFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const token = await this.getToken();
    const url = new URL(`${CANVAS_BASE_URL}/api/v1${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Canvas API error: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  /** Get all active courses for the user */
  async getActiveCourses() {
    const courses = await this.canvasFetch<CanvasCourse[]>("/courses", {
      enrollment_state: "active",
      per_page: "50",
    });

    return courses.map((c) => ({
      id: String(c.id),
      name: c.name,
      code: c.course_code,
    }));
  }

  /** Get upcoming assignments across all courses */
  async getUpcomingAssignments() {
    // Canvas TODO items endpoint gives upcoming items
    const items = await this.canvasFetch<any[]>("/users/self/upcoming_events", {
      per_page: "20",
    });

    return items
      .filter((item) => item.type === "assignment" || item.assignment)
      .map((item) => ({
        id: String(item.id || item.assignment?.id),
        name: item.title || item.assignment?.name,
        courseName: item.context_name || "",
        dueAt: item.end_at || item.assignment?.due_at || "",
        pointsPossible: item.assignment?.points_possible || 0,
      }));
  }

  /** Get recent grades */
  async getRecentGrades() {
    // Fetch submissions with grades across courses
    const courses = await this.getActiveCourses();
    const allGrades: any[] = [];

    // Fetch in parallel (limit concurrency)
    const batchSize = 5;
    for (let i = 0; i < courses.length; i += batchSize) {
      const batch = courses.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (course) => {
          const submissions = await this.canvasFetch<any[]>(
            `/courses/${course.id}/students/submissions`,
            {
              student_ids: "all",
              per_page: "10",
              order: "graded_at",
              order_direction: "descending",
              workflow_state: "graded",
            }
          );
          return submissions.map((s) => ({
            courseName: course.name,
            assignmentName: s.assignment?.name || "Sin nombre",
            score: s.score,
            maxScore: s.assignment?.points_possible || 100,
            gradedAt: s.graded_at,
          }));
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          allGrades.push(...result.value);
        }
      }
    }

    // Sort by most recent and return top entries
    return allGrades
      .filter((g) => g.score !== null)
      .sort((a, b) => new Date(b.gradedAt).getTime() - new Date(a.gradedAt).getTime())
      .slice(0, 10);
  }

  /** Search files across courses */
  async searchFiles(query: string) {
    const courses = await this.getActiveCourses();
    const allFiles: any[] = [];

    for (const course of courses.slice(0, 10)) {
      try {
        const files = await this.canvasFetch<any[]>(`/courses/${course.id}/files`, {
          search_term: query,
          per_page: "5",
        });
        allFiles.push(
          ...files.map((f) => ({
            id: String(f.id),
            name: f.display_name || f.filename,
            courseName: course.name,
            size: f.size,
            contentType: f.content_type || f["content-type"],
            url: f.url,
            updatedAt: f.updated_at,
          }))
        );
      } catch {
        // Skip courses where file access fails
      }
    }

    return allFiles;
  }
}
