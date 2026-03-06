// ============================================
// adiutask Server — Bun
// HTTP API + WebSocket server
// ============================================

// Load .env from packages/web/ even when Bun is launched from the project root
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";

const __serverDir = dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const __envPath = resolve(__serverDir, "..", ".env");
if (existsSync(__envPath)) {
  for (const line of readFileSync(__envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

import { authRoutes } from "./routes/auth.routes";
import { dashboardRoutes } from "./routes/dashboard.routes";
import { pushRoutes } from "./routes/push.routes";
import { fileRoutes } from "./routes/file.routes";
import { adminRoutes } from "./routes/admin.routes";
import { handleWebSocketUpgrade, websocketHandler } from "./websocket/ws.handler";
import { verifyJWT, verifyJWTToken } from "./middleware/auth.middleware";
import { initDatabase } from "./db/database";
import { rateLimit } from "./middleware/rate-limit";
import { validateEnv } from "./config/env";
import { NotificationScheduler } from "./services/notification-scheduler";

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === "production";

// Validate environment variables
validateEnv();

console.log(`🤖 adiutask server starting on port ${PORT}...`);
console.log(`   DATABASE_URL=${process.env.DATABASE_URL || "(not set, using ./data/adiutask.db)"}`);

// Initialize database
try {
  await initDatabase();
} catch (err) {
  console.error("❌ Database init failed:", err);
  process.exit(1);
}

// Start notification scheduler
const notificationScheduler = new NotificationScheduler();
notificationScheduler.start();

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

    // --- CORS Preflight ---
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // --- Health check (for Railway) ---
    if (path === "/" || path === "/health") {
      return json({ status: "ok", uptime: process.uptime() });
    }

    // --- Rate limiting ---
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rlKey = path.startsWith("/api/auth") ? "auth" : "api";
    const rlLimit = rlKey === "auth" ? 20 : 60; // per minute
    if (!rateLimit(clientIp, rlKey, rlLimit)) {
      return json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento." }, 429);
    }

    // --- API Routes ---
    let response: Response;
    try {
      if (path.startsWith("/api/auth")) {
        response = await authRoutes(req, url);
      } else if (path.startsWith("/api/files")) {
        // File proxy supports both Authorization header and ?token= query param
        // (window.open can't set headers, so we accept token in URL)
        const authResult = await verifyJWT(req);
        let userId: string | null = null;
        if (authResult.ok) {
          userId = authResult.userId;
        } else {
          const qToken = url.searchParams.get("token");
          if (qToken) {
            const payload = await verifyJWTToken(qToken);
            if (payload) userId = payload.userId;
          }
        }
        if (!userId) {
          response = json({ error: "No autorizado" }, 401);
        } else {
          response = await fileRoutes(req, url, userId);
        }
      } else {
        const authResult = await verifyJWT(req);
        if (!authResult.ok) {
          response = json({ error: "No autorizado" }, 401);
        } else if (path.startsWith("/api/admin")) {
          response = await adminRoutes(req, url, authResult.userId, authResult.email);
        } else if (path.startsWith("/api/dashboard")) {
          response = await dashboardRoutes(req, url, authResult.userId);
        } else if (path.startsWith("/api/push")) {
          response = await pushRoutes(req, url, authResult.userId);
        } else {
          response = json({ error: "Ruta no encontrada" }, 404);
        }
      }
    } catch (err) {
      console.error("[Server] Error:", err);
      response = json({ error: "Error interno del servidor" }, 500);
    }

    // Add CORS + security headers to ALL responses
    const headers = { ...corsHeaders(), ...securityHeaders() };
    for (const [key, value] of Object.entries(headers)) {
      response!.headers.set(key, value);
    }
    return response!;
  },

  // --- WebSocket Handler ---
  websocket: websocketHandler,
});

console.log(`✅ adiutask server running at http://localhost:${PORT}`);

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
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || (IS_PROD ? "https://adiutask.app" : "*"),
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...(IS_PROD ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
  };
}
