// ============================================
// Bot Engine — LLM-first architecture
// All messages go directly through the LLM
// ============================================

import {
  CanvasClient, TokenExpiredError,
  createLLMProvider, type LLMProvider,
} from "@adiutask/core";
import { ConversationStore } from "./conversation";
import { getUserCanvasToken, saveCanvasToken } from "../db/database";

const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL || "https://ufv-es.instructure.com";

// Shared instances
const conversation = new ConversationStore();

// Lazy LLM initialization — avoids process.exit at import time so the server
// can start and respond to healthchecks even if ANTHROPIC_API_KEY is missing.
let llmProvider: LLMProvider | null = null;

function getLLMProvider(): LLMProvider {
  if (llmProvider) return llmProvider;

  const llm = createLLMProvider(
    undefined,
    2048,
    `- Usa **negrita** para énfasis.
- Usa emojis como viñetas (📚, ✅, 📅, etc.).
- NO uses markdown de enlaces [texto](url) a menos que sea un enlace real.`,
    'Si el usuario no tiene cuenta vinculada, guíale para vincularla escribiendo "vincular".',
  );

  if (!llm) {
    throw new Error("ANTHROPIC_API_KEY is required. Cannot process messages without LLM provider.");
  }

  llmProvider = llm;
  console.log("[BOT] Claude LLM provider initialized");
  return llmProvider;
}

// Track users awaiting Canvas token input
const awaitingToken = new Set<string>();

// Per-user Canvas client cache (avoids re-creating per message)
const canvasClients = new Map<string, CanvasClient>();

/** Result from the bot engine */
export interface BotResponse {
  text: string;
  responseType?: string;
  metadata?: Record<string, unknown>;
  resolvedBy: "llm" | "system";
}

/**
 * Process a user message — all queries go through the LLM.
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
    // ========== LLM processing ==========
    console.log(`[BOT] LLM processing: "${trimmed.slice(0, 50)}"`);
    const llmResponse = await getLLMProvider().processMessage(message, canvas, history);
    conversation.addMessage(userId, "user", message);
    conversation.addMessage(userId, "assistant", llmResponse);
    return { text: llmResponse, resolvedBy: "llm" };
  } catch (err) {
    if (err instanceof TokenExpiredError) {
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

  if (normalized.includes("hola") || normalized.includes("hey") || normalized.includes("buenas") ||
      normalized.includes("ayuda") || normalized.includes("help")) {
    return {
      text: "👋 **¡Hola! Soy adiutask**, tu asistente para Canvas UFV.\n\n" +
        "Para empezar, necesitas vincular tu cuenta de Canvas.\n" +
        "Escribe **\"vincular\"** para conectar tu cuenta.",
      resolvedBy: "system",
    };
  }

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
