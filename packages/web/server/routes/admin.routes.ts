// ============================================
// Admin Routes
// Protected endpoints for monitoring user activity
// ============================================

import { getChatHistory, getUserById } from "../db/database";
import { Database } from "bun:sqlite";

const DB_PATH = process.env.DATABASE_URL || "./data/adiutask.db";

// Admin emails (comma-separated in env var)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function adminRoutes(
  req: Request,
  url: URL,
  userId: string,
  userEmail: string,
): Promise<Response> {
  if (!isAdmin(userEmail)) {
    return json({ error: "No autorizado" }, 403);
  }

  if (req.method !== "GET") {
    return json({ error: "Metodo no permitido" }, 405);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const path = url.pathname;

  try {
    // GET /api/admin/stats — General stats
    if (path === "/api/admin/stats") {
      const userCount = db.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM users").get()!.cnt;
      const linkedCount = db.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM users WHERE canvas_token IS NOT NULL").get()!.cnt;
      const messageCount = db.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM chat_history").get()!.cnt;
      const errorCount = db.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM chat_history WHERE response_type = 'error'").get()!.cnt;
      const todayMessages = db.query<{ cnt: number }, []>(
        "SELECT COUNT(*) as cnt FROM chat_history WHERE created_at >= datetime('now', '-1 day')"
      ).get()!.cnt;

      return json({
        users: { total: userCount, linked: linkedCount },
        messages: { total: messageCount, today: todayMessages, errors: errorCount },
      });
    }

    // GET /api/admin/users — List all users
    if (path === "/api/admin/users") {
      const users = db.query<
        { id: string; email: string; name: string; has_canvas: number; created_at: string; message_count: number },
        []
      >(`
        SELECT u.id, u.email, u.name,
               CASE WHEN u.canvas_token IS NOT NULL THEN 1 ELSE 0 END as has_canvas,
               u.created_at,
               (SELECT COUNT(*) FROM chat_history ch WHERE ch.user_id = u.id) as message_count
        FROM users u
        ORDER BY u.created_at DESC
      `).all();

      return json(users);
    }

    // GET /api/admin/conversations?user_id=X&limit=50 — Chat history for a user
    if (path === "/api/admin/conversations") {
      const targetUserId = url.searchParams.get("user_id");
      const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);

      if (!targetUserId) {
        // Return list of users with recent messages
        const active = db.query<
          { user_id: string; email: string; name: string; last_message: string; message_count: number },
          []
        >(`
          SELECT ch.user_id, u.email, u.name,
                 MAX(ch.created_at) as last_message,
                 COUNT(*) as message_count
          FROM chat_history ch
          JOIN users u ON u.id = ch.user_id
          GROUP BY ch.user_id
          ORDER BY last_message DESC
        `).all();

        return json(active);
      }

      const messages = db.query<
        { id: string; role: string; content: string; response_type: string | null; metadata: string | null; created_at: string },
        [string, number]
      >(`
        SELECT id, role, content, response_type, metadata, created_at
        FROM chat_history
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(targetUserId, limit);

      // Reverse to show chronological order
      messages.reverse();

      const user = await getUserById(targetUserId);

      return json({
        user: user ? { id: user.id, email: user.email, name: user.name } : null,
        messages,
      });
    }

    // GET /api/admin/errors?limit=30 — Recent error responses
    if (path === "/api/admin/errors") {
      const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 100);

      const errors = db.query<
        { id: string; user_id: string; email: string; name: string; content: string; response_type: string; created_at: string },
        [number]
      >(`
        SELECT ch.id, ch.user_id, u.email, u.name, ch.content, ch.response_type, ch.created_at
        FROM chat_history ch
        JOIN users u ON u.id = ch.user_id
        WHERE ch.response_type = 'error'
        ORDER BY ch.created_at DESC
        LIMIT ?
      `).all(limit);

      return json(errors);
    }

    return json({ error: "Ruta admin no encontrada" }, 404);
  } finally {
    db.close();
  }
}
