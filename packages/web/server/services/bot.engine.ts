// ============================================
// Bot Engine — LLM-first architecture
// All messages go directly through the LLM
// ============================================

import {
  CanvasClient, TokenExpiredError,
  createLLMProvider, type LLMProvider, type CollectedFile,
} from "@adiutask/core";
import { ConversationStore } from "./conversation";
import { getUserCanvasToken, saveCanvasToken } from "../db/database";
import { getFileType, humanizeSize } from "@shared/file-utils";
import type { FileInfo } from "@shared/types";

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
    4096,
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

/** Clear cached Canvas client for a user (e.g. when unlinking) */
export function clearCanvasClient(userId: string): void {
  canvasClients.delete(userId);
}

// Canvas token regex: digits~alphanumeric(20+) — the real Canvas format
const CANVAS_TOKEN_REGEX = /\d+~[A-Za-z0-9]{20,}/;
// Fallback: any 40+ char alphanumeric+tilde string (for edge cases)
const GENERIC_TOKEN_REGEX = /^[A-Za-z0-9~]{40,}$/;

/**
 * Extract a Canvas API token from a message.
 * Handles: bare token, "mi token es X", "token: X", "aquí tienes X", etc.
 * Returns the token string or null if no token found.
 * NEVER passes token content to the LLM.
 */
function extractCanvasToken(message: string): string | null {
  // Try the specific Canvas format first (most reliable)
  const match = message.match(CANVAS_TOKEN_REGEX);
  if (match) return match[0];

  // If the whole message is a long alphanumeric string, treat as token
  const trimmed = message.trim();
  if (GENERIC_TOKEN_REGEX.test(trimmed)) return trimmed;

  return null;
}

/** Result from the bot engine */
export interface BotResponse {
  text: string;
  responseType?: string;
  metadata?: Record<string, unknown>;
  resolvedBy: "llm" | "system";
}

/** Convert collected raw files to FileInfo[] for the frontend */
function buildFileInfos(files: CollectedFile[]): FileInfo[] {
  // Deduplicate by id
  const seen = new Set<number>();
  const result: FileInfo[] = [];
  for (const f of files) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    const ft = getFileType(f.contentType);
    result.push({
      id: String(f.id),
      name: f.name,
      size: f.size,
      humanSize: humanizeSize(f.size),
      contentType: f.contentType,
      fileType: ft,
      url: `/api/files/${f.id}/redirect`,
      updatedAt: f.updatedAt,
    });
  }
  return result;
}

/**
 * Process a user message — all queries go through the LLM.
 */
export async function processMessage(userId: string, message: string): Promise<BotResponse> {
  const trimmed = message.trim();

  // --- Token detection (FIRST — intercept before anything, never pass to LLM) ---
  const extractedToken = extractCanvasToken(trimmed);
  if (extractedToken) {
    awaitingToken.delete(userId); // clear awaiting state if present
    console.log(`[BOT] Canvas token detected for user ${userId} (${extractedToken.slice(0, 4)}...)`);
    return await handleTokenValidation(userId, extractedToken);
  }

  // --- Token linking flow (user was asked to paste token, but sent non-token text) ---
  if (awaitingToken.has(userId)) {
    awaitingToken.delete(userId);
    return {
      text: "❌ Eso no parece un token de Canvas. El token es una cadena larga de caracteres alfanuméricos.\n\nInténtalo de nuevo o escribe **\"vincular\"** para ver las instrucciones.",
      resolvedBy: "system",
      responseType: "error",
    };
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

  // Validate LLM provider is available before entering try/catch
  let llm: LLMProvider;
  try {
    llm = getLLMProvider();
  } catch {
    console.error("[BOT] ANTHROPIC_API_KEY is not configured — cannot process messages");
    return {
      text: "⚠️ El servicio de IA no está configurado. Contacta al administrador.",
      resolvedBy: "system",
      responseType: "error",
    };
  }

  try {
    // ========== LLM processing ==========
    console.log(`[BOT] LLM processing: "${trimmed.slice(0, 50)}"`);
    const result = await llm.processMessageRich(message, canvas, history);
    conversation.addMessage(userId, "user", message);
    conversation.addMessage(userId, "assistant", result.text);

    // Build response with file metadata if files were collected
    const response: BotResponse = { text: result.text, resolvedBy: "llm" };
    if (result.files.length > 0) {
      const fileInfos = buildFileInfos(result.files);
      if (fileInfos.length > 0) {
        response.responseType = "file_list";
        response.metadata = { files: fileInfos };
        console.log(`[BOT] Attached ${fileInfos.length} files to response`);
      }
    }
    return response;
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      canvasClients.delete(userId);
      return {
        text: "⚠️ Tu token de Canvas ha expirado o no es válido. Renuévalo en Canvas (Perfil > Configuración > Tokens de acceso) y escribe **\"vincular\"** para actualizarlo.",
        resolvedBy: "system",
        responseType: "error",
      };
    }
    const error = err as Record<string, unknown>;
    const errType = error.name ?? error.constructor?.name ?? "Error";
    console.error(`[BOT] Error for user ${userId}: [${errType}] ${(err as Error).message}`);
    if ((err as Error).stack) console.error((err as Error).stack);
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
