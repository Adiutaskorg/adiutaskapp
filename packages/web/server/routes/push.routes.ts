// ============================================
// Push Notification Routes
// Subscribe/unsubscribe from push notifications
// ============================================

import { savePushSubscription, deletePushSubscription } from "../db/database";

export async function pushRoutes(
  req: Request,
  url: URL,
  userId: string
): Promise<Response> {
  const path = url.pathname;

  // POST /api/push/subscribe
  if (path === "/api/push/subscribe" && req.method === "POST") {
    try {
      const subscription = await req.json();
      await savePushSubscription(userId, subscription);
      return json({ ok: true });
    } catch (err) {
      console.error("[Push] Subscribe error:", err);
      return json({ error: "Failed to save subscription" }, 500);
    }
  }

  // DELETE /api/push/subscribe
  if (path === "/api/push/subscribe" && req.method === "DELETE") {
    try {
      await deletePushSubscription(userId);
      return json({ ok: true });
    } catch (err) {
      console.error("[Push] Unsubscribe error:", err);
      return json({ error: "Failed to remove subscription" }, 500);
    }
  }

  return json({ error: "Push route not found" }, 404);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
