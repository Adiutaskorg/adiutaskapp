// ============================================
// Bot Engine — Real 3-tier routing
// Tier 1: Keyword matching (routeCommand)
// Tier 2: Context resolution (resolveContext)
// Tier 3: LLM fallback (Claude with tool use)
// ============================================

import { CanvasClient, TokenExpiredError } from "../canvas/client";
import { routeCommand, type CommandResult } from "../router/commands";
import { resolveContext } from "../router/context-resolver";
import { createLLMProvider, type LLMProvider } from "../ai/llm";
import { ConversationStore } from "./conversation";
import { getUserCanvasToken, saveCanvasToken } from "../db/database";

const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL || "https://ufv-es.instructure.com";

// Shared instances
const conversation = new ConversationStore();
const llm = createLLMProvider();

// Track users awaiting Canvas token input
const awaitingToken = new Set<string>();

// Per-user Canvas client cache (avoids re-creating per message)
const canvasClients = new Map<string, CanvasClient>();

if (llm) {
  console.log("[BOT] Claude LLM provider initialized (Tier 3 enabled)");
} else {
  console.log("[BOT] No ANTHROPIC_API_KEY — Tier 3 (LLM) disabled, keyword + context only");
}

/** Result from the bot engine */
export interface BotResponse {
  text: string;
  responseType?: string;
  metadata?: Record<string, unknown>;
  resolvedBy: "keyword" | "context" | "llm" | "system";
}

function getResultText(result: CommandResult): string {
  return typeof result === "string" ? result : result.text;
}

/**
 * Process a user message through the 3-tier routing system.
 */
export async function processMessage(userId: string, message: string): Promise<BotResponse> {
  const trimmed = message.trim();

  // --- Token linking flow ---
  if (awaitingToken.has(userId)) {
    awaitingToken.delete(userId);
    return await handleTokenValidation(userId, trimmed);
  }

  // Auto-detect if message looks like a Canvas API token
  if (trimmed.length > 50 && /^[A-Za-z0-9~]+$/.test(trimmed)) {
    return await handleTokenValidation(userId, trimmed);
  }

  // --- Check Canvas token ---
  const canvasToken = await getUserCanvasToken(userId);

  if (!canvasToken) {
    return handleNoToken(trimmed, userId);
  }

  // Get or create Canvas client for this user
  let canvas = canvasClients.get(userId);
  if (!canvas) {
    canvas = new CanvasClient(CANVAS_BASE_URL, canvasToken);
    canvasClients.set(userId, canvas);
  }

  const history = conversation.getHistory(userId);

  try {
    // ========== TIER 1: Command Router (keyword matching) ==========
    const directResponse = await routeCommand(message, canvas);
    if (directResponse) {
      const text = getResultText(directResponse);
      conversation.addMessage(userId, "user", message);
      conversation.addMessage(userId, "assistant", text);
      console.log(`[BOT] Tier 1 response for user ${userId}`);
      return { text, resolvedBy: "keyword" };
    }

    // ========== TIER 2: Context Resolver (follow-up expansion) ==========
    if (history.length > 0) {
      const expanded = resolveContext(message, history);
      if (expanded) {
        const resolvedResponse = await routeCommand(expanded, canvas);
        if (resolvedResponse) {
          const text = getResultText(resolvedResponse);
          conversation.addMessage(userId, "user", message);
          conversation.addMessage(userId, "assistant", text);
          console.log(`[BOT] Tier 2 response for user ${userId} (expanded: "${expanded}")`);
          return { text, resolvedBy: "context" };
        }
      }
    }

    // ========== TIER 3: LLM (Claude with Canvas tools) ==========
    if (llm) {
      console.log(`[BOT] Tier 3 — forwarding to LLM: "${trimmed.slice(0, 50)}"`);
      const llmResponse = await llm.processMessage(message, canvas, history);
      conversation.addMessage(userId, "user", message);
      conversation.addMessage(userId, "assistant", llmResponse);
      console.log(`[BOT] Tier 3 response for user ${userId}`);
      return { text: llmResponse, resolvedBy: "llm" };
    }

    // ========== Fallback — no LLM, unrecognized ==========
    return {
      text: "🤔 No entendí tu pregunta. Prueba con:\n\n" +
        "📚 **\"mis cursos\"** — Ver tus cursos\n" +
        "📝 **\"tareas\"** — Tareas pendientes\n" +
        "📊 **\"notas\"** — Calificaciones\n" +
        "📅 **\"calendario\"** — Próximos eventos\n" +
        "📢 **\"anuncios\"** — Anuncios recientes\n" +
        "📁 **\"archivos de [curso]\"** — Material del curso",
      resolvedBy: "system",
    };
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      // Clear cached client
      canvasClients.delete(userId);
      return {
        text: "⚠️ Tu token de Canvas ha expirado o no es válido. Renuévalo en Canvas (Perfil > Configuración > Tokens de acceso) y escribe **\"vincular\"** para actualizarlo.",
        resolvedBy: "system",
        responseType: "error",
      };
    }
    console.error(`[BOT] Error for user ${userId}:`, (err as Error).message);
    return {
      text: "😅 Hubo un error procesando tu mensaje. Inténtalo de nuevo.",
      resolvedBy: "system",
      responseType: "error",
    };
  }
}

// --- Handle messages when user has no Canvas token ---

function handleNoToken(message: string, userId: string): BotResponse {
  const normalized = message.toLowerCase().trim();

  // User wants to link their account
  if (normalized.includes("vincular") || normalized.includes("token") || normalized.includes("conectar")) {
    awaitingToken.add(userId);
    return {
      text: "🔗 Para vincular tu cuenta de Canvas, envíame tu token en el siguiente mensaje.\n\n" +
        "Para obtenerlo:\n" +
        "1. Entra a https://ufv-es.instructure.com\n" +
        "2. Ve a **Perfil > Configuración > Tokens de acceso**\n" +
        "3. Genera un nuevo token y pégalo aquí",
      resolvedBy: "system",
    };
  }

  // Greeting or help — respond but mention linking
  if (normalized.includes("hola") || normalized.includes("hey") || normalized.includes("buenas") ||
      normalized.includes("ayuda") || normalized.includes("help")) {
    return {
      text: "👋 **¡Hola! Soy UniBot**, tu asistente para Canvas UFV.\n\n" +
        "Para empezar, necesitas vincular tu cuenta de Canvas.\n" +
        "Escribe **\"vincular\"** para conectar tu cuenta.",
      resolvedBy: "system",
    };
  }

  // Default: prompt to link
  return {
    text: "⚠️ No tienes tu cuenta de Canvas vinculada.\n\n" +
      "Necesito tu token para consultar tus datos. Escribe **\"vincular\"** para empezar.",
    resolvedBy: "system",
  };
}

// --- Token validation ---

async function handleTokenValidation(userId: string, token: string): Promise<BotResponse> {
  const canvas = new CanvasClient(CANVAS_BASE_URL, token);
  try {
    const profile = await canvas.validateToken();
    await saveCanvasToken(userId, token);
    // Cache the new client
    canvasClients.set(userId, canvas);
    console.log(`[BOT] User ${userId} linked Canvas account: ${profile.name}`);
    return {
      text: `✅ **¡Cuenta vinculada!**\n\nBienvenido/a, **${profile.name}** 👋\nYa puedes preguntarme sobre tus cursos, tareas, notas y más.`,
      resolvedBy: "system",
    };
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return {
        text: "❌ El token no es válido. Verifica que lo copiaste correctamente y que no ha expirado.",
        resolvedBy: "system",
        responseType: "error",
      };
    }
    console.error(`[BOT] Token validation failed for user ${userId}:`, (err as Error).message);
    return {
      text: "❌ Error al validar el token. Inténtalo de nuevo.",
      resolvedBy: "system",
      responseType: "error",
    };
  }
}
