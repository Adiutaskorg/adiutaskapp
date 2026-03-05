// ============================================
// Notification Scheduler — Web Push
// Periodic checks for assignments, announcements, grades
// ============================================

import webPush from "web-push";
import { CanvasClient } from "@adiutask/core";
import {
  getUsersWithPushSubscriptions,
  hasNotificationBeenSent,
  markNotificationSent,
  pruneOldNotifications,
  deletePushSubscriptionSync,
} from "../db/database";
import { isEncryptionConfigured, decryptToken } from "../lib/crypto";

const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL || "https://ufv-es.instructure.com";
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MS_24H = 24 * 60 * 60 * 1000;
const MS_2H = 2 * 60 * 60 * 1000;
const MS_1H = 60 * 60 * 1000;

export class NotificationScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
      console.warn("[Notifications] VAPID keys not configured — push notifications disabled");
      return;
    }

    webPush.setVapidDetails(
      "mailto:admin@adiutask.app",
      publicKey,
      privateKey
    );
    console.log("[Notifications] Web Push configured with VAPID keys");
  }

  start(): void {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return;
    }

    // Run first cycle after a short delay
    setTimeout(() => this.runCycle(), 10_000);

    this.timer = setInterval(() => this.runCycle(), CHECK_INTERVAL_MS);
    console.log(`[Notifications] Scheduler started (every ${CHECK_INTERVAL_MS / 60000} min)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runCycle(): Promise<void> {
    try {
      // Prune old sent_notifications records
      pruneOldNotifications(7);

      const users = getUsersWithPushSubscriptions();
      if (users.length === 0) return;

      console.log(`[Notifications] Checking ${users.length} user(s)...`);

      for (const user of users) {
        try {
          const token = await this.decryptCanvasToken(user.canvasToken);
          if (!token) continue;

          const canvas = new CanvasClient(CANVAS_BASE_URL, token);
          const subscription = JSON.parse(user.subscription);

          await this.checkUpcomingAssignments(user.userId, canvas, subscription);
          await this.checkNewAnnouncements(user.userId, canvas, subscription);
        } catch (err) {
          console.error(`[Notifications] Error for user ${user.userId}:`, (err as Error).message);
        }
      }
    } catch (err) {
      console.error("[Notifications] Cycle error:", err);
    }
  }

  private async decryptCanvasToken(storedToken: string): Promise<string | null> {
    if (isEncryptionConfigured() && storedToken.includes(":")) {
      try {
        return await decryptToken(storedToken);
      } catch {
        return storedToken;
      }
    }
    return storedToken;
  }

  private async checkUpcomingAssignments(
    userId: string,
    canvas: CanvasClient,
    subscription: webPush.PushSubscription
  ): Promise<void> {
    try {
      const courses = await canvas.getCourses();
      const now = Date.now();

      for (const course of courses) {
        const assignments = await canvas.getAssignments(course.id, true);

        for (const a of assignments) {
          if (!a.due_at) continue;
          const dueTime = new Date(a.due_at).getTime();
          const timeLeft = dueTime - now;

          // 24h reminder
          if (timeLeft > 0 && timeLeft <= MS_24H) {
            const refId = `assignment-24h-${a.id}`;
            if (!hasNotificationBeenSent(userId, "assignment_reminder", refId)) {
              const hours = Math.round(timeLeft / (60 * 60 * 1000));
              await this.sendPush(userId, subscription, {
                title: `📝 ${a.name}`,
                body: `Entrega en ~${hours}h — ${course.name}`,
                tag: refId,
              });
              markNotificationSent(userId, "assignment_reminder", refId);
            }
          }

          // 2h reminder
          if (timeLeft > 0 && timeLeft <= MS_2H) {
            const refId = `assignment-2h-${a.id}`;
            if (!hasNotificationBeenSent(userId, "assignment_urgent", refId)) {
              const mins = Math.round(timeLeft / 60000);
              await this.sendPush(userId, subscription, {
                title: `⚠️ ${a.name}`,
                body: `¡Entrega en ${mins} min! — ${course.name}`,
                tag: refId,
              });
              markNotificationSent(userId, "assignment_urgent", refId);
            }
          }
        }
      }
    } catch (err) {
      console.error(`[Notifications] Assignment check error for ${userId}:`, (err as Error).message);
    }
  }

  private async checkNewAnnouncements(
    userId: string,
    canvas: CanvasClient,
    subscription: webPush.PushSubscription
  ): Promise<void> {
    try {
      const courses = await canvas.getCourses();
      const courseIds = courses.map((c) => c.id);
      if (courseIds.length === 0) return;

      const announcements = await canvas.getAnnouncements(courseIds);
      const now = Date.now();

      for (const ann of announcements) {
        if (!ann.posted_at) continue;
        const postedTime = new Date(ann.posted_at).getTime();
        const age = now - postedTime;

        if (age <= MS_1H) {
          // Use title + posted_at as unique identifier since Announcement has no id
          const refId = `announcement-${ann.title.slice(0, 40)}-${ann.posted_at}`;
          if (!hasNotificationBeenSent(userId, "announcement", refId)) {
            await this.sendPush(userId, subscription, {
              title: `📢 ${ann.course_name || "Nuevo anuncio"}`,
              body: ann.title,
              tag: refId,
            });
            markNotificationSent(userId, "announcement", refId);
          }
        }
      }
    } catch (err) {
      console.error(`[Notifications] Announcement check error for ${userId}:`, (err as Error).message);
    }
  }

  private async sendPush(
    userId: string,
    subscription: webPush.PushSubscription,
    payload: { title: string; body: string; tag: string }
  ): Promise<void> {
    try {
      await webPush.sendNotification(subscription, JSON.stringify(payload));
      console.log(`[Notifications] Sent "${payload.tag}" to user ${userId}`);
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        console.log(`[Notifications] Subscription expired for user ${userId}, removing`);
        deletePushSubscriptionSync(userId);
      } else {
        console.error(`[Notifications] Push failed for user ${userId}:`, (err as Error).message);
      }
    }
  }
}
