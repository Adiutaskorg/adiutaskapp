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

console.log(`🤖 UniBot server starting on port ${PORT}...`);
console.log(`   DATABASE_URL=${process.env.DATABASE_URL || "(not set, using ./data/unibot.db)"}`);

// Initialize database
try {
  await initDatabase();
} catch (err) {
  console.error("❌ Database init failed:", err);
  process.exit(1);
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",

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

    // --- Health check (for Railway) ---
    if (path === "/" || path === "/health") {
      return json({ status: "ok", uptime: process.uptime() });
    }

    // --- API Routes ---
    let response: Response;
    try {
      // Auth routes (public)
      if (path.startsWith("/api/auth")) {
        response = await authRoutes(req, url);
      } else {
        // Protected routes — require valid JWT
        const authResult = await verifyJWT(req);
        if (!authResult.ok) {
          response = json({ error: "Unauthorized" }, 401);
        } else if (path.startsWith("/api/dashboard")) {
          response = await dashboardRoutes(req, url, authResult.userId);
        } else if (path.startsWith("/api/push")) {
          response = await pushRoutes(req, url, authResult.userId);
        } else {
          response = json({ error: "Not found" }, 404);
        }
      }
    } catch (err) {
      console.error("[Server] Error:", err);
      response = json({ error: "Internal server error" }, 500);
    }

    // Add CORS headers to ALL responses
    const cors = corsHeaders();
    for (const [key, value] of Object.entries(cors)) {
      response!.headers.set(key, value);
    }
    return response!
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
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || (process.env.NODE_ENV === "production" ? "https://unibot.ufv.es" : "*"),
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}
