import type { Api } from "grammy";
import { config } from "../config";
import { AppDatabase } from "../db/database";
import { CanvasClient, TokenExpiredError } from "../canvas/client";
import type { User } from "../db/schema";
import type { Course } from "../canvas/types";
import {
  formatAssignmentReminder,
  formatNewAnnouncement,
  formatGradeUpdate,
} from "./formatters";

export class NotificationScheduler {
  private db: AppDatabase;
  private api: Api;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(db: AppDatabase, api: Api) {
    this.db = db;
    this.api = api;
  }

  start(): void {
    const intervalMs = config.notificationIntervalMinutes * 60 * 1000;
    console.log(`[NOTIF] Scheduler started (every ${config.notificationIntervalMinutes} min)`);

    // Run first check after a short delay to let the bot stabilize
    setTimeout(() => this.runCycle(), 10_000);

    this.timer = setInterval(() => this.runCycle(), intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[NOTIF] Scheduler stopped");
    }
  }

  private async runCycle(): Promise<void> {
    console.log("[NOTIF] Starting notification cycle");
    try {
      this.db.pruneOldNotifications(7);
      await this.checkAllUsers();
    } catch (err) {
      console.error("[NOTIF] Cycle error:", (err as Error).message);
    }
    console.log("[NOTIF] Cycle complete");
  }

  private async checkAllUsers(): Promise<void> {
    const users = this.db.getUsersWithNotifications();
    console.log(`[NOTIF] Checking ${users.length} user(s)`);

    for (const user of users) {
      try {
        const canvas = new CanvasClient(config.canvasApiUrl, user.canvas_token);
        const courses = await canvas.getCourses();

        await this.checkUpcomingAssignments(user, canvas, courses);
        await this.checkNewAnnouncements(user, canvas, courses);
        await this.checkNewGrades(user, canvas, courses);
      } catch (err) {
        if (err instanceof TokenExpiredError) {
          console.log(`[NOTIF] Token expired for user ${user.telegram_id}, skipping`);
          continue;
        }
        // Bot blocked by user — disable notifications
        if (this.isBotBlocked(err)) {
          console.log(`[NOTIF] Bot blocked by user ${user.telegram_id}, disabling notifications`);
          this.db.setNotificationsEnabled(user.telegram_id, false);
          continue;
        }
        console.error(`[NOTIF] Error for user ${user.telegram_id}:`, (err as Error).message);
      }
    }
  }

  private async checkUpcomingAssignments(
    user: User,
    canvas: CanvasClient,
    courses: Course[]
  ): Promise<void> {
    const now = Date.now();

    for (const course of courses) {
      try {
        const assignments = await canvas.getAssignments(course.id, true);

        for (const assignment of assignments) {
          if (!assignment.due_at) continue;

          const dueAt = new Date(assignment.due_at).getTime();
          const hoursLeft = (dueAt - now) / (1000 * 60 * 60);

          // 24h reminder
          if (hoursLeft > 0 && hoursLeft <= 24) {
            const refId = `assignment:${assignment.id}:24h`;
            if (!this.db.hasNotificationBeenSent(user.telegram_id, "assignment_reminder", refId)) {
              const msg = formatAssignmentReminder(assignment, course.name, hoursLeft);
              await this.sendNotification(user.telegram_id, msg);
              this.db.markNotificationSent(user.telegram_id, "assignment_reminder", refId);
            }
          }

          // 2h reminder
          if (hoursLeft > 0 && hoursLeft <= 2) {
            const refId = `assignment:${assignment.id}:2h`;
            if (!this.db.hasNotificationBeenSent(user.telegram_id, "assignment_reminder", refId)) {
              const msg = formatAssignmentReminder(assignment, course.name, hoursLeft);
              await this.sendNotification(user.telegram_id, msg);
              this.db.markNotificationSent(user.telegram_id, "assignment_reminder", refId);
            }
          }
        }
      } catch (err) {
        console.error(`[NOTIF] Assignments check failed for course ${course.id}:`, (err as Error).message);
      }
    }
  }

  private async checkNewAnnouncements(
    user: User,
    canvas: CanvasClient,
    courses: Course[]
  ): Promise<void> {
    try {
      const courseIds = courses.map((c) => c.id);
      if (courseIds.length === 0) return;

      const announcements = await canvas.getAnnouncements(courseIds);
      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      for (const announcement of announcements) {
        const postedAt = new Date(announcement.posted_at).getTime();
        if (postedAt < oneHourAgo) continue;

        const refId = `announcement:${announcement.title}:${announcement.posted_at}`;
        if (!this.db.hasNotificationBeenSent(user.telegram_id, "announcement", refId)) {
          const courseName = announcement.course_name ?? "Curso desconocido";
          const msg = formatNewAnnouncement(announcement, courseName);
          await this.sendNotification(user.telegram_id, msg);
          this.db.markNotificationSent(user.telegram_id, "announcement", refId);
        }
      }
    } catch (err) {
      console.error(`[NOTIF] Announcements check failed:`, (err as Error).message);
    }
  }

  private async checkNewGrades(
    user: User,
    canvas: CanvasClient,
    courses: Course[]
  ): Promise<void> {
    for (const course of courses) {
      try {
        const grades = await canvas.getGrades(course.id);
        const scoreKey = `${course.id}:${grades.current_score}`;
        const refId = `grade:${scoreKey}`;

        if (!this.db.hasNotificationBeenSent(user.telegram_id, "grade", refId)) {
          // Check if there was a *previous* grade entry for this course
          // to avoid notifying on first scan
          const hasPrevious = this.db.hasAnyNotificationForPrefix(
            user.telegram_id,
            "grade",
            `grade:${course.id}:`
          );

          if (hasPrevious) {
            // Score changed — send notification
            const msg = formatGradeUpdate(
              grades.course_name || course.name,
              grades.current_score,
              grades.current_grade
            );
            await this.sendNotification(user.telegram_id, msg);
          }

          // Mark current score as sent (or as baseline on first scan)
          this.db.markNotificationSent(user.telegram_id, "grade", refId);
        }
      } catch (err) {
        console.error(`[NOTIF] Grades check failed for course ${course.id}:`, (err as Error).message);
      }
    }
  }

  private async sendNotification(telegramId: string, text: string): Promise<void> {
    try {
      await this.api.sendMessage(Number(telegramId), text, { parse_mode: "Markdown" });
      console.log(`[NOTIF] Sent to ${telegramId}: ${text.slice(0, 50)}...`);
    } catch (err) {
      if (this.isBotBlocked(err)) throw err;
      console.error(`[NOTIF] Failed to send to ${telegramId}:`, (err as Error).message);
    }
  }

  private isBotBlocked(err: unknown): boolean {
    const msg = (err as Error)?.message ?? "";
    return msg.includes("bot was blocked") || msg.includes("user is deactivated");
  }
}
