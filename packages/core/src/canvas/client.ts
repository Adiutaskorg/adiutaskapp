import type {
  UserProfile,
  Course,
  Assignment,
  Grades,
  CalendarEvent,
  Announcement,
  CourseFile,
  CourseFolder,
} from "../types/canvas";

export class TokenExpiredError extends Error {
  constructor(message = "Canvas token expired or invalid") {
    super(message);
    this.name = "TokenExpiredError";
  }
}

export class CanvasAPIError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "CanvasAPIError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

// Cache TTLs in milliseconds
const CACHE_TTL: Record<string, number> = {
  getCourses: 30 * 60 * 1000,
  getGrades: 5 * 60 * 1000,
  getAssignments: 2 * 60 * 1000,
  getUpcomingEvents: 2 * 60 * 1000,
  getAnnouncements: 5 * 60 * 1000,
  getCourseFiles: 10 * 60 * 1000,
  getCourseFolders: 5 * 60 * 1000,
  getFolderFiles: 10 * 60 * 1000,
  getFolderSubfolders: 5 * 60 * 1000,
};

// --- Concurrency semaphore (Phase 6) ---

class Semaphore {
  private running = 0;
  private queue: (() => void)[] = [];

  constructor(private maxConcurrency: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrency) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}

export class CanvasClient {
  private baseUrl: string;
  private token: string;
  private cache = new Map<string, CacheEntry>();
  private semaphore: Semaphore;

  constructor(baseUrl: string, token: string, maxConcurrency = 4) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
    this.semaphore = new Semaphore(maxConcurrency);
  }

  private getCached<T>(key: string, ttl: number): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttl) {
      this.cache.delete(key);
      return null;
    }
    console.log(`[CANVAS] Cache hit: ${key}`);
    return entry.data as T;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async request(path: string, retried = false): Promise<unknown> {
    await this.semaphore.acquire();
    try {
      return await this._doRequest(path, retried);
    } finally {
      this.semaphore.release();
    }
  }

  private async _doRequest(path: string, retried: boolean): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const start = Date.now();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    const remaining = res.headers.get("X-Rate-Limit-Remaining");
    if (remaining && parseFloat(remaining) < 50) {
      console.log(`[CANVAS] Rate limit low (${remaining}), throttling`);
      await sleep(500);
    }

    if (res.ok) {
      console.log(`[CANVAS] ${res.status} ${path.split("?")[0]} (${Date.now() - start}ms)`);
      return res.json();
    }

    if (res.status === 401) {
      console.log(`[ERROR] Canvas 401 on ${path.split("?")[0]}`);
      throw new TokenExpiredError();
    }

    if (res.status === 403) {
      const retryAfter = res.headers.get("Retry-After");
      if (retryAfter && !retried) {
        console.log(`[CANVAS] Rate limited, retrying after ${retryAfter}s`);
        await sleep(parseFloat(retryAfter) * 1000);
        return this._doRequest(path, true);
      }
    }

    if (res.status >= 500 && !retried) {
      console.log(`[ERROR] Canvas ${res.status} on ${path.split("?")[0]}, retrying...`);
      await sleep(2000);
      return this._doRequest(path, true);
    }

    const body = await res.text().catch(() => "No response body");
    console.error(`[ERROR] Canvas ${res.status} on ${path.split("?")[0]}: ${body.slice(0, 200)}`);
    throw new CanvasAPIError(res.status, `Canvas ${res.status}: ${body}`);
  }

  // 1. Validate token
  async validateToken(): Promise<UserProfile> {
    const data = (await this.request("/api/v1/users/self/profile")) as Record<string, unknown>;
    return {
      id: data.id as number,
      name: data.name as string,
      email: (data.primary_email ?? data.login_id ?? "") as string,
    };
  }

  // 2. Active courses
  async getCourses(): Promise<Course[]> {
    const key = "getCourses";
    const cached = this.getCached<Course[]>(key, CACHE_TTL.getCourses);
    if (cached) return cached;

    const data = (await this.request(
      "/api/v1/courses?enrollment_state=active&per_page=50"
    )) as Record<string, unknown>[];
    const result = data.map((c) => ({
      id: c.id as number,
      name: c.name as string,
      course_code: c.course_code as string,
    }));
    this.setCache(key, result);
    return result;
  }

  // 3. Assignments
  async getAssignments(courseId: number, onlyPending = false): Promise<Assignment[]> {
    const key = `getAssignments:${courseId}`;
    const cached = this.getCached<Assignment[]>(key, CACHE_TTL.getAssignments);
    let assignments: Assignment[];

    if (cached) {
      assignments = cached;
    } else {
      const data = (await this.request(
        `/api/v1/courses/${courseId}/assignments?order_by=due_at&per_page=30`
      )) as Record<string, unknown>[];

      assignments = data.map((a) => ({
        id: a.id as number,
        name: a.name as string,
        due_at: (a.due_at as string) ?? null,
        points_possible: (a.points_possible as number) ?? null,
        submission_types: (a.submission_types as string[]) ?? [],
      }));
      this.setCache(key, assignments);
    }

    if (onlyPending) {
      const now = new Date();
      assignments = assignments.filter((a) => {
        if (!a.due_at) return true;
        return new Date(a.due_at) > now;
      });
    }

    return assignments;
  }

  // 4. Grades
  async getGrades(courseId: number): Promise<Grades> {
    const key = `getGrades:${courseId}`;
    const cached = this.getCached<Grades>(key, CACHE_TTL.getGrades);
    if (cached) return cached;

    const data = (await this.request(
      `/api/v1/courses/${courseId}/enrollments?user_id=self&include[]=grades`
    )) as Record<string, unknown>[];

    const enrollment = data[0];
    if (!enrollment) throw new CanvasAPIError(404, "No enrollment found for this course");

    const grades = (enrollment.grades ?? {}) as Record<string, unknown>;
    const result: Grades = {
      course_name: (enrollment.course_name ?? "") as string,
      current_score: (grades.current_score as number) ?? null,
      current_grade: (grades.current_grade as string) ?? null,
      final_score: (grades.final_score as number) ?? null,
    };
    this.setCache(key, result);
    return result;
  }

  // 5. Upcoming events
  async getUpcomingEvents(_days?: number): Promise<CalendarEvent[]> {
    const key = `getUpcomingEvents:${_days ?? "all"}`;
    const cached = this.getCached<CalendarEvent[]>(key, CACHE_TTL.getUpcomingEvents);
    if (cached) return cached;

    const data = (await this.request(
      "/api/v1/users/self/upcoming_events"
    )) as Record<string, unknown>[];

    const result = data.map((e) => ({
      title: (e.title as string) ?? "",
      start_at: (e.start_at as string) ?? null,
      end_at: (e.end_at as string) ?? null,
      type: (e.type as string) ?? "",
      course_name: e.context_name as string | null ?? null,
    }));
    this.setCache(key, result);
    return result;
  }

  // 6. Announcements
  async getAnnouncements(courseIds: number[]): Promise<Announcement[]> {
    const key = `getAnnouncements:${courseIds.sort().join(",")}`;
    const cached = this.getCached<Announcement[]>(key, CACHE_TTL.getAnnouncements);
    if (cached) return cached;

    const contextCodes = courseIds.map((id) => `context_codes[]=course_${id}`).join("&");
    const data = (await this.request(
      `/api/v1/announcements?${contextCodes}&latest_only=true`
    )) as Record<string, unknown>[];

    const result = data.map((a) => ({
      title: (a.title as string) ?? "",
      message: (a.message as string) ?? "",
      posted_at: (a.posted_at as string) ?? "",
      course_name: (a.context_code as string)?.replace("course_", "") ?? null,
    }));
    this.setCache(key, result);
    return result;
  }

  // 7. Course files
  async getCourseFiles(courseId: number): Promise<CourseFile[]> {
    const key = `getCourseFiles:${courseId}`;
    const cached = this.getCached<CourseFile[]>(key, CACHE_TTL.getCourseFiles);
    if (cached) return cached;

    const data = (await this.request(
      `/api/v1/courses/${courseId}/files?per_page=50&sort=updated_at&order=desc`
    )) as Record<string, unknown>[];

    const result = data.map((f) => ({
      id: f.id as number,
      display_name: (f.display_name as string) ?? "",
      size: (f.size as number) ?? 0,
      url: (f.url as string) ?? "",
      updated_at: (f.updated_at as string) ?? "",
    }));
    this.setCache(key, result);
    return result;
  }

  // 8. File download URL
  async getFileDownloadUrl(fileId: number): Promise<string> {
    const data = (await this.request(
      `/api/v1/files/${fileId}/public_url`
    )) as Record<string, unknown>;
    return (data.public_url as string) ?? "";
  }

  // 9. Get single file metadata
  async getFile(fileId: number): Promise<CourseFile> {
    const f = (await this.request(`/api/v1/files/${fileId}`)) as Record<string, unknown>;
    return {
      id: f.id as number,
      display_name: (f.display_name as string) ?? "",
      size: (f.size as number) ?? 0,
      url: (f.url as string) ?? "",
      updated_at: (f.updated_at as string) ?? "",
    };
  }

  // 10. Course folders
  async getCourseFolders(courseId: number): Promise<CourseFolder[]> {
    const key = `getCourseFolders:${courseId}`;
    const cached = this.getCached<CourseFolder[]>(key, CACHE_TTL.getCourseFolders);
    if (cached) return cached;

    const data = (await this.request(
      `/api/v1/courses/${courseId}/folders?per_page=50`
    )) as Record<string, unknown>[];

    const result = data.map((f) => ({
      id: f.id as number,
      name: (f.name as string) ?? "",
      full_name: (f.full_name as string) ?? "",
      parent_folder_id: (f.parent_folder_id as number) ?? null,
      files_count: (f.files_count as number) ?? 0,
      folders_count: (f.folders_count as number) ?? 0,
    }));
    this.setCache(key, result);
    return result;
  }

  // 11. Files inside a specific folder
  async getFolderFiles(folderId: number): Promise<CourseFile[]> {
    const key = `getFolderFiles:${folderId}`;
    const cached = this.getCached<CourseFile[]>(key, CACHE_TTL.getFolderFiles);
    if (cached) return cached;

    const data = (await this.request(
      `/api/v1/folders/${folderId}/files?per_page=50`
    )) as Record<string, unknown>[];

    const result = data.map((f) => ({
      id: f.id as number,
      display_name: (f.display_name as string) ?? "",
      size: (f.size as number) ?? 0,
      url: (f.url as string) ?? "",
      updated_at: (f.updated_at as string) ?? "",
    }));
    this.setCache(key, result);
    return result;
  }

  // 12. Subfolders of a specific folder
  async getFolderSubfolders(folderId: number): Promise<CourseFolder[]> {
    const key = `getFolderSubfolders:${folderId}`;
    const cached = this.getCached<CourseFolder[]>(key, CACHE_TTL.getFolderSubfolders);
    if (cached) return cached;

    const data = (await this.request(
      `/api/v1/folders/${folderId}/folders?per_page=50`
    )) as Record<string, unknown>[];

    const result = data.map((f) => ({
      id: f.id as number,
      name: (f.name as string) ?? "",
      full_name: (f.full_name as string) ?? "",
      parent_folder_id: (f.parent_folder_id as number) ?? null,
      files_count: (f.files_count as number) ?? 0,
      folders_count: (f.folders_count as number) ?? 0,
    }));
    this.setCache(key, result);
    return result;
  }

  // 13. Download file contents (returns ArrayBuffer for cross-platform compatibility)
  async downloadFile(fileId: number, fileMeta?: CourseFile): Promise<{ buffer: ArrayBuffer; name: string; size: number }> {
    const file = fileMeta ?? await this.getFile(fileId);
    const url = await this.getFileDownloadUrl(fileId);
    const res = await fetch(url);
    if (!res.ok) {
      throw new CanvasAPIError(res.status, `Failed to download file: ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: arrayBuffer,
      name: file.display_name,
      size: file.size,
    };
  }

  // 14. Get single folder metadata
  async getFolder(folderId: number): Promise<CourseFolder> {
    const f = (await this.request(`/api/v1/folders/${folderId}`)) as Record<string, unknown>;
    return {
      id: f.id as number,
      name: (f.name as string) ?? "",
      full_name: (f.full_name as string) ?? "",
      parent_folder_id: (f.parent_folder_id as number) ?? null,
      files_count: (f.files_count as number) ?? 0,
      folders_count: (f.folders_count as number) ?? 0,
    };
  }
}
