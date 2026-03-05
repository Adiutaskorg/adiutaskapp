// ============================================
// File Proxy Routes
// Resolves fresh Canvas download URLs on demand
// ============================================

import { CanvasClient } from "@adiutask/core";
import { getUserCanvasToken } from "../db/database";

const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL || "https://ufv-es.instructure.com";

// Simple per-user rate limiter: max 30 file requests per minute
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkFileRateLimit(userId: string): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(userId);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60_000 };
    rateBuckets.set(userId, bucket);
  }
  bucket.count++;
  return bucket.count <= 30;
}

/**
 * File routes accept auth either from:
 * - Authorization header (normal API flow)
 * - ?token= query param (for window.open from frontend)
 *
 * The userId parameter comes from the server's JWT middleware
 * when using Authorization header. For query param auth,
 * we handle it here.
 */
export async function fileRoutes(req: Request, url: URL, userId: string): Promise<Response> {
  // GET /api/files/:fileId/redirect
  const match = url.pathname.match(/^\/api\/files\/(\d+)\/redirect$/);
  if (!match || req.method !== "GET") {
    return json({ error: "Ruta no encontrada" }, 404);
  }

  const fileId = parseInt(match[1], 10);
  if (isNaN(fileId)) {
    return json({ error: "ID de archivo invalido" }, 400);
  }

  // Rate limit
  if (!checkFileRateLimit(userId)) {
    return json({ error: "Demasiadas solicitudes de archivos. Espera un momento." }, 429);
  }

  // Get user's Canvas token
  const canvasToken = await getUserCanvasToken(userId);
  if (!canvasToken) {
    return json({ error: "No tienes Canvas vinculado" }, 403);
  }

  try {
    const canvas = new CanvasClient(CANVAS_BASE_URL, canvasToken);
    const downloadUrl = await canvas.getFileDownloadUrl(fileId);

    if (!downloadUrl) {
      return json({ error: "No se pudo obtener la URL del archivo" }, 404);
    }

    console.log(`[FILES] Redirect user=${userId} file=${fileId}`);

    // 302 redirect to the fresh Canvas URL
    return new Response(null, {
      status: 302,
      headers: { Location: downloadUrl },
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes("expired") || message.includes("401")) {
      return json({ error: "Token de Canvas expirado" }, 401);
    }
    console.error(`[FILES] Error for user=${userId} file=${fileId}:`, message);
    return json({ error: "Error al obtener el archivo" }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
