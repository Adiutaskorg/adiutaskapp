// ============================================
// WebSocket Handler
// Manages real-time chat connections
// ============================================

import type { ServerWebSocket } from "bun";
import type { WSClientMessage, WSServerMessage, ChatMessage, ResponseType } from "@shared/types";
import { WS_CLOSE_CODES } from "@shared/constants";
import { verifyJWTToken } from "../middleware/auth.middleware";
import { processMessage } from "../services/bot.engine";

/** Data attached to each WebSocket connection */
interface WSData {
  userId: string;
  connectedAt: number;
}

/** Active connections map */
const connections = new Map<string, ServerWebSocket<WSData>>();

/**
 * Handle HTTP → WebSocket upgrade
 * Returns a Response on error, or undefined on successful upgrade
 */
export async function handleWebSocketUpgrade(req: Request, server: any): Promise<Response | undefined> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing token", { status: 401 });
  }

  const payload = await verifyJWTToken(token);
  if (!payload) {
    return new Response("Invalid token", { status: 401 });
  }

  const upgraded = server.upgrade(req, {
    data: {
      userId: payload.userId,
      connectedAt: Date.now(),
    } satisfies WSData,
  });

  if (!upgraded) {
    return new Response("WebSocket upgrade failed", { status: 500 });
  }

  // Return undefined — Bun handles the upgrade
  return undefined;
}

/**
 * WebSocket event handlers passed to Bun.serve()
 */
export const websocketHandler = {
  open(ws: ServerWebSocket<WSData>) {
    const { userId } = ws.data;
    console.log(`[WS] Client connected: ${userId}`);

    // Close previous connection if exists (single session)
    const existing = connections.get(userId);
    if (existing) {
      existing.close(WS_CLOSE_CODES.NORMAL, "New session opened");
    }

    connections.set(userId, ws);
  },

  async message(ws: ServerWebSocket<WSData>, raw: string | Buffer) {
    try {
      const data: WSClientMessage = JSON.parse(String(raw));
      const { userId } = ws.data;

      switch (data.type) {
        case "chat_message": {
          if (!data.payload?.trim()) return;

          // Send typing indicator
          send(ws, { type: "typing_indicator" });

          // Process through the LLM bot engine
          const startTime = performance.now();
          const botResponse = await processMessage(userId, data.payload.trim());
          const processingTime = Math.round(performance.now() - startTime);

          // Build chat message response
          const message: ChatMessage = {
            id: crypto.randomUUID(),
            role: "bot",
            content: botResponse.text,
            responseType: (botResponse.responseType || "text") as ResponseType,
            metadata: {
              ...botResponse.metadata,
              resolvedBy: botResponse.resolvedBy,
              processingTime,
            },
            timestamp: Date.now(),
          };

          send(ws, { type: "chat_response", message });
          break;
        }

        case "ping": {
          send(ws, { type: "pong" });
          break;
        }

        default:
          console.warn(`[WS] Unknown message type: ${data.type}`);
      }
    } catch (err) {
      console.error("[WS] Message handling error:", err);
      send(ws, {
        type: "error",
        error: "Error procesando tu mensaje. Inténtalo de nuevo.",
      });
    }
  },

  close(ws: ServerWebSocket<WSData>, code: number, reason: string) {
    const { userId } = ws.data;
    console.log(`[WS] Client disconnected: ${userId} (${code}: ${reason})`);
    connections.delete(userId);
  },
};

// --- Helpers ---

function send(ws: ServerWebSocket<WSData>, message: WSServerMessage) {
  if (ws.readyState === 1) { // WebSocket.OPEN
    ws.send(JSON.stringify(message));
  }
}

/**
 * Send a push message to a connected user (used by notification service)
 */
export function sendToUser(userId: string, message: WSServerMessage): boolean {
  const ws = connections.get(userId);
  if (ws) {
    send(ws, message);
    return true;
  }
  return false;
}
