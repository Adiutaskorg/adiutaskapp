// ============================================
// UniBot Server — Bun
// HTTP API + WebSocket server
// ============================================

import { authRoutes } from "./routes/auth.routes";
import { dashboardRoutes } from "./routes/dashboard.routes";
import { pushRoutes } from "./routes/push.routes";
import { handleWebSocketUpgrade, websocketHandler } from "./websocket/ws.handler";
import { verifyJWT } from "./middleware/auth.middleware";
import { initDatabase } from "./db/database";

const PORT = Number(process.env.PORT) || 3000;

// Initialize database
await initDatabase();

console.log(`🤖 UniBot server starting on port ${PORT}...`);

Bun.serve({
  port: PORT,

  // --- HTTP Request Handler ---
  async fetch(req, server) {
    const url = new URL(req.url);
    const path = url.pathname;

    // --- WebSocket Upgrade ---
    if (path === "/ws") {
      return await handleWebSocketUpgrade(req, server);
    }

    // --- CORS Headers (for dev) ---
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // --- API Routes ---
    try {
      // Auth routes (public)
      if (path.startsWith("/api/auth")) {
        return await authRoutes(req, url);
      }

      // Protected routes — require valid JWT
      const authResult = await verifyJWT(req);
      if (!authResult.ok) {
        return json({ error: "Unauthorized" }, 401);
      }

      if (path.startsWith("/api/dashboard")) {
        return await dashboardRoutes(req, url, authResult.userId);
      }

      if (path.startsWith("/api/push")) {
        return await pushRoutes(req, url, authResult.userId);
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error("[Server] Error:", err);
      return json({ error: "Internal server error" }, 500);
    }
  },

  // --- WebSocket Handler ---
  websocket: websocketHandler,
});

console.log(`✅ UniBot server running at http://localhost:${PORT}`);

// --- Helpers ---

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": process.env.NODE_ENV === "production" ? "https://unibot.ufv.es" : "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}
