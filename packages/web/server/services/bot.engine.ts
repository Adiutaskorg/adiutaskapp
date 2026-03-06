// ============================================
// Bot Engine — 3-Tier intent routing
// Tier 1: regex/keyword → direct Canvas API
// Tier 2: fuzzy similarity → direct Canvas API
// Tier 3: LLM fallback (last resort)
// ============================================

import {
  CanvasClient, TokenExpiredError,
  createLLMProvider, type LLMProvider, type CollectedFile,
  type Course,
} from "@adiutask/core";
import { ConversationStore } from "./conversation";
import { getUserCanvasToken, saveCanvasToken, recordRouting } from "../db/database";
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

function extractCanvasToken(message: string): string | null {
  const match = message.match(CANVAS_TOKEN_REGEX);
  if (match) return match[0];
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
 * Process a user message — 3-tier routing: regex → fuzzy → LLM.
 */
export async function processMessage(userId: string, message: string): Promise<BotResponse> {
  const trimmed = message.trim();
  const startTime = performance.now();

  // --- Token detection (FIRST — intercept before anything, never pass to LLM) ---
  const extractedToken = extractCanvasToken(trimmed);
  if (extractedToken) {
    awaitingToken.delete(userId);
    console.log(`[BOT] Canvas token detected for user ${userId} (${extractedToken.slice(0, 4)}...)`);
    const res = await handleTokenValidation(userId, extractedToken);
    recordMetric("interceptor", "token_detect", userId, trimmed, startTime);
    return res;
  }

  // --- Token linking flow ---
  if (awaitingToken.has(userId)) {
    awaitingToken.delete(userId);
    recordMetric("interceptor", "token_awaiting", userId, trimmed, startTime);
    return {
      text: "Eso no parece un token de Canvas. El token es una cadena larga de caracteres alfanuméricos.\n\nInténtalo de nuevo o escribe **\"vincular\"** para ver las instrucciones.",
      resolvedBy: "system",
      responseType: "error",
    };
  }

  // --- Check Canvas token ---
  const canvasToken = await getUserCanvasToken(userId);

  if (!canvasToken) {
    const res = handleNoToken(trimmed, userId);
    recordMetric("tier1", "no_token:" + (res.responseType || "info"), userId, trimmed, startTime);
    return res;
  }

  // Get or create Canvas client for this user
  let canvas = canvasClients.get(userId);
  if (!canvas) {
    canvas = new CanvasClient(CANVAS_BASE_URL, canvasToken);
    canvasClients.set(userId, canvas);
  }

  // --- TIER 1: Regex/keyword pattern matching ---
  const tier1 = detectIntentTier1(trimmed);
  if (tier1) {
    try {
      console.log(`[BOT] Tier1 intent: ${tier1.id} (regex, no LLM)`);
      const directResponse = await handleIntent(tier1, canvas);
      conversation.addMessage(userId, "user", message);
      conversation.addMessage(userId, "assistant", directResponse.text);
      recordMetric("tier1", tier1.id, userId, trimmed, startTime);
      return directResponse;
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        canvasClients.delete(userId);
        recordMetric("tier1", "token_expired", userId, trimmed, startTime);
        return {
          text: "Tu token de Canvas ha expirado o no es válido. Renuévalo en Canvas (Perfil > Configuración > Tokens de acceso) y escribe **\"vincular\"** para actualizarlo.",
          resolvedBy: "system",
          responseType: "error",
        };
      }
      console.log(`[BOT] Tier1 handler failed, trying Tier2: ${(err as Error).message}`);
    }
  }

  // --- TIER 2: Fuzzy similarity matching ---
  const tier2 = detectIntentTier2(trimmed);
  if (tier2) {
    try {
      console.log(`[BOT] Tier2 intent: ${tier2.id} (fuzzy score=${tier2.score.toFixed(2)}, no LLM)`);
      const directResponse = await handleIntent(tier2, canvas);
      conversation.addMessage(userId, "user", message);
      conversation.addMessage(userId, "assistant", directResponse.text);
      recordMetric("tier2", tier2.id, userId, trimmed, startTime);
      return directResponse;
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        canvasClients.delete(userId);
        recordMetric("tier2", "token_expired", userId, trimmed, startTime);
        return {
          text: "Tu token de Canvas ha expirado o no es válido. Renuévalo en Canvas (Perfil > Configuración > Tokens de acceso) y escribe **\"vincular\"** para actualizarlo.",
          resolvedBy: "system",
          responseType: "error",
        };
      }
      console.log(`[BOT] Tier2 handler failed, falling back to LLM: ${(err as Error).message}`);
    }
  }

  // --- TIER 3: LLM fallback (last resort) ---
  const history = conversation.getHistory(userId);

  let llm: LLMProvider;
  try {
    llm = getLLMProvider();
  } catch {
    console.error("[BOT] ANTHROPIC_API_KEY is not configured — cannot process messages");
    recordMetric("tier3", "llm_unavailable", userId, trimmed, startTime);
    return {
      text: "El servicio de IA no está configurado. Contacta al administrador.",
      resolvedBy: "system",
      responseType: "error",
    };
  }

  try {
    console.log(`[BOT] Tier3 LLM fallback: "${trimmed.slice(0, 60)}"`);
    const result = await llm.processMessageRich(message, canvas, history);
    conversation.addMessage(userId, "user", message);
    conversation.addMessage(userId, "assistant", result.text);

    const response: BotResponse = { text: result.text, resolvedBy: "llm" };
    if (result.files.length > 0) {
      const fileInfos = buildFileInfos(result.files);
      if (fileInfos.length > 0) {
        response.responseType = "file_list";
        response.metadata = { files: fileInfos };
      }
    }
    // Record with message text for Tier3 analysis
    recordMetric("tier3", "llm_fallback", userId, trimmed, startTime, trimmed);
    return response;
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      canvasClients.delete(userId);
      return {
        text: "Tu token de Canvas ha expirado o no es válido. Renuévalo en Canvas (Perfil > Configuración > Tokens de acceso) y escribe **\"vincular\"** para actualizarlo.",
        resolvedBy: "system",
        responseType: "error",
      };
    }
    const error = err as Record<string, unknown>;
    const errType = error.name ?? error.constructor?.name ?? "Error";
    console.error(`[BOT] Error for user ${userId}: [${errType}] ${(err as Error).message}`);
    if ((err as Error).stack) console.error((err as Error).stack);
    recordMetric("tier3", "llm_error", userId, trimmed, startTime, trimmed);
    return {
      text: "Hubo un error procesando tu mensaje. Inténtalo de nuevo.",
      resolvedBy: "system",
      responseType: "error",
    };
  }
}

// ── Metrics helper ──

function recordMetric(
  tier: string,
  intentId: string,
  userId: string,
  message: string,
  startTime: number,
  messageText?: string,
): void {
  try {
    const ms = Math.round(performance.now() - startTime);
    recordRouting(tier, intentId, userId, message.length, ms, messageText);
  } catch {
    // Non-critical — don't break message handling if metrics fail
  }
}

// ── No-token handler ──

function handleNoToken(message: string, userId: string): BotResponse {
  const normalized = message.toLowerCase().trim();

  if (normalized.includes("vincular") || normalized.includes("token") || normalized.includes("conectar")) {
    awaitingToken.add(userId);
    return {
      text: "Para vincular tu cuenta de Canvas, envíame tu token en el siguiente mensaje.\n\n" +
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
      text: "**¡Hola! Soy adiutask**, tu asistente para Canvas UFV.\n\n" +
        "Para empezar, necesitas vincular tu cuenta de Canvas.\n" +
        "Escribe **\"vincular\"** para conectar tu cuenta.",
      resolvedBy: "system",
    };
  }

  return {
    text: "No tienes tu cuenta de Canvas vinculada.\n\n" +
      "Necesito tu token para consultar tus datos. Escribe **\"vincular\"** para empezar.",
    resolvedBy: "system",
  };
}

// ── Token validation ──

async function handleTokenValidation(userId: string, token: string): Promise<BotResponse> {
  const canvas = new CanvasClient(CANVAS_BASE_URL, token);
  try {
    const profile = await canvas.validateToken();
    await saveCanvasToken(userId, token);
    canvasClients.set(userId, canvas);
    console.log(`[BOT] User ${userId} linked Canvas account: ${profile.name}`);
    return {
      text: `**¡Cuenta vinculada!**\n\nBienvenido/a, **${profile.name}**\nYa puedes preguntarme sobre tus cursos, tareas, notas y más.`,
      resolvedBy: "system",
    };
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return {
        text: "El token no es válido. Verifica que lo copiaste correctamente y que no ha expirado.",
        resolvedBy: "system",
        responseType: "error",
      };
    }
    console.error(`[BOT] Token validation failed for user ${userId}:`, (err as Error).message);
    return {
      text: "Error al validar el token. Inténtalo de nuevo.",
      resolvedBy: "system",
      responseType: "error",
    };
  }
}

// ============================================
// TIER 1: Regex/keyword pattern matching
// ============================================

interface MatchedIntent {
  id: string;
  type: string;
  courseHint?: string;
  score: number; // 1.0 for Tier 1, 0-1 for Tier 2
}

// --- Regex patterns (broad to minimize LLM fallback) ---

const COURSES_RE = /\b(mis\s*cursos|asignaturas|materias|qu[eé]\s*cursos|qu[eé]\s*estudio|listado?\s*de\s*cursos|en\s*qu[eé]\s*estoy\s*matriculad[oa])\b/i;
const GRADES_RE = /\b(mis\s*notas|calificaciones?|notas?\b|qu[eé]\s*(nota|calificaci[oó]n)|c[oó]mo\s*(voy|estoy|llevo)|qu[eé]\s*saqu[eé]|qu[eé]\s*he\s*sacado|media|promedio|resultados?|expediente)\b/i;
const ASSIGNMENTS_RE = /\b(tareas?\s*(pendientes?)?|deberes|entregas?\s*(pendientes?)?|pr[aá]cticas?\s*(pendientes?)?|qu[eé]\s*(tengo|hay)\s*(que\s*entregar|pendiente)|algo\s*pendiente|pr[oó]xima\s*entrega|cu[aá]ndo\s*entrego|fecha\s*de\s*entrega|trabajos?\s*(pendientes?)?|actividad(es)?\s*(pendientes?)?|cosas?\s*(pendientes?|por\s*hacer|que\s*hacer)|qu[eé]\s*me\s*falta\s*(por\s*)?entregar)\b/i;
const EVENTS_RE = /\b(eventos?|calendario|ex[aá]me(n|nes)|agenda|pr[oó]xim(o|a|os|as)\s*(eventos?|entregas?|examen|ex[aá]menes)|cu[aá]ndo\s*(es|son|hay|tengo)\s*(el\s+|los\s+|un\s+)?(examen|parcial|final|prueba|control)|parciale?s|finale?s)\b/i;
const ANNOUNCEMENTS_RE = /\b(anuncios?|avisos?|noticias?|novedades?|qu[eé]\s*hay\s*de\s*nuevo|ha\s*(dicho|publicado|puesto|subido)\s*(algo\s*)?(el\s*)?profes?o?r?)\b/i;
const FILES_RE = /\b(archivos?|documentos?|materiale?s?|ficheros?|pdfs?|apuntes?|recursos?|presentaci[oó]n(es)?|diapositivas?|temario|transparencias?)\b/i;
const OVERVIEW_RE = /\b(resumen|ponme\s*al\s*d[ií]a|c[oó]mo\s*va\s*todo|qu[eé]\s*me\s*(espera|queda|falta)|estado\s*(general|actual)|vista\s*general)\b/i;
const LINK_RE = /\b(vincular|conectar|enlazar|token)\b/i;

const GREETING_RE = /^(hola|hey|buenas|buenos?\s*(d[ií]as?|tardes?|noches?)|qu[eé]\s*tal|saludos|hi|hello|ey+|epa|wenas|qu[eé]\s*pasa|qu[eé]\s*hay|qu[eé]\s*onda|c[oó]mo\s*(est[aá]s|va|andas))\b/i;
const THANKS_RE = /^(gracias|thanks?|genial|perfecto|guay|vale|ok[i]?|de\s*acuerdo|entendido|claro|mola|top|bien|excelente|estupendo|fenomenal|s[uú]per|incre[ií]ble|much[ia]s?\s*gracias|vale\s*gracias|ok\s*gracias)\b/i;
const GOODBYE_RE = /^(adi[oó]s|chao|bye|hasta\s*(luego|ma[nñ]ana|pronto|otra)|nos\s*vemos|me\s*voy|ya\s*est[aá]|eso\s*es\s*todo|nada\s*m[aá]s|cu[ií]date|chau)\b/i;
const HELP_RE = /\b(ayuda|help|qu[eé]\s*puedes\s*(hacer|decir)|men[uú]|opciones|comandos|c[oó]mo\s*(funciona|te\s*uso|va\s*esto))\b/i;
const SHORT_CHITCHAT_RE = /^(s[ií]|no|ya|ok|lol|jaja[ja]*|jeje[je]*|xd+|wow|\?+|[.]+)$/i;

// Time-based queries
const TODAY_RE = /\b(qu[eé]\s*(tengo|hay|toca)\s*hoy|hoy\s*qu[eé]|clases?\s*de\s*hoy|horario\s*(de\s*)?hoy|agenda\s*de\s*hoy)\b/i;
const TOMORROW_RE = /\b(qu[eé]\s*(tengo|hay|toca)\s*ma[nñ]ana|ma[nñ]ana\s*qu[eé]|clases?\s*de\s*ma[nñ]ana)\b/i;
const THIS_WEEK_RE = /\b(qu[eé]\s*(tengo|hay)\s*(esta\s*)?semana|esta\s*semana|horario\s*semanal|mi\s*semana|planning|agenda\s*(de\s*la\s*)?semana)\b/i;

function detectIntentTier1(message: string): MatchedIntent | null {
  const m = message.toLowerCase().trim();

  // Canvas data intents (highest priority, checked first)
  if (COURSES_RE.test(m)) return { id: "courses", type: "courses", courseHint: extractCourseHint(m), score: 1 };

  // Time-based queries (before generic patterns to capture "qué tengo hoy" correctly)
  if (TODAY_RE.test(m)) return { id: "overview_today", type: "overview", score: 1 };
  if (TOMORROW_RE.test(m)) return { id: "overview_tomorrow", type: "overview", score: 1 };
  if (THIS_WEEK_RE.test(m)) return { id: "overview_week", type: "overview", score: 1 };

  if (GRADES_RE.test(m)) return { id: "grades", type: "grades", courseHint: extractCourseHint(m), score: 1 };
  if (ASSIGNMENTS_RE.test(m)) return { id: "assignments", type: "assignments", courseHint: extractCourseHint(m), score: 1 };
  if (EVENTS_RE.test(m)) return { id: "events", type: "events", score: 1 };
  if (ANNOUNCEMENTS_RE.test(m)) return { id: "announcements", type: "announcements", score: 1 };
  if (FILES_RE.test(m)) return { id: "files", type: "files", courseHint: extractCourseHint(m), score: 1 };
  if (OVERVIEW_RE.test(m)) return { id: "overview", type: "overview", score: 1 };

  // Account
  if (LINK_RE.test(m)) return { id: "link", type: "link", score: 1 };

  // Chitchat
  if (GREETING_RE.test(m)) return { id: "greeting", type: "greeting", score: 1 };
  if (THANKS_RE.test(m)) return { id: "thanks", type: "thanks", score: 1 };
  if (GOODBYE_RE.test(m)) return { id: "goodbye", type: "goodbye", score: 1 };
  if (HELP_RE.test(m)) return { id: "help", type: "help", score: 1 };
  if (SHORT_CHITCHAT_RE.test(m)) return { id: "short_chitchat", type: "thanks", score: 1 };

  // Broad catch: short ambiguous queries → overview
  if (m.length <= 50 && /^(qu[eé]\s+(tengo|hay|me|tal)|d[ií]me|cu[eé]ntame|mu[eé]strame|ensé[nñ]ame)/i.test(m)) {
    return { id: "overview_vague", type: "overview", score: 1 };
  }

  return null;
}

// ============================================
// TIER 2: Fuzzy similarity matching
// ============================================

// Precomputed normalized phrases → intent mapping
const FUZZY_CATALOG: { norm: string; intent: MatchedIntent }[] = buildFuzzyCatalog();

function buildFuzzyCatalog(): { norm: string; intent: MatchedIntent }[] {
  const entries: [string, MatchedIntent][] = [
    // ── Notas ──
    ["mis notas", { id: "grades", type: "grades", score: 0 }],
    ["como voy de notas", { id: "grades", type: "grades", score: 0 }],
    ["que notas tengo", { id: "grades", type: "grades", score: 0 }],
    ["mis calificaciones", { id: "grades", type: "grades", score: 0 }],
    ["como estoy en las asignaturas", { id: "grades", type: "grades", score: 0 }],
    ["como llevo el curso", { id: "grades", type: "grades", score: 0 }],
    ["nota media", { id: "grades", type: "grades", score: 0 }],
    ["ver mis notas", { id: "grades", type: "grades", score: 0 }],
    ["consultar notas", { id: "grades", type: "grades", score: 0 }],
    ["dime mis notas", { id: "grades", type: "grades", score: 0 }],
    ["quiero ver mis notas", { id: "grades", type: "grades", score: 0 }],
    ["dame mis calificaciones", { id: "grades", type: "grades", score: 0 }],
    ["ensenname mis notas", { id: "grades", type: "grades", score: 0 }],
    ["expediente academico", { id: "grades", type: "grades", score: 0 }],
    ["resumen de notas", { id: "grades", type: "grades", score: 0 }],
    ["cuanto tengo", { id: "grades", type: "grades", score: 0 }],
    ["que he sacado", { id: "grades", type: "grades", score: 0 }],
    ["como voy en el curso", { id: "grades", type: "grades", score: 0 }],
    ["como llevo las asignaturas", { id: "grades", type: "grades", score: 0 }],

    // ── Tareas ──
    ["tareas pendientes", { id: "assignments", type: "assignments", score: 0 }],
    ["que tengo que entregar", { id: "assignments", type: "assignments", score: 0 }],
    ["que tengo pendiente", { id: "assignments", type: "assignments", score: 0 }],
    ["proximas entregas", { id: "assignments", type: "assignments", score: 0 }],
    ["trabajos por hacer", { id: "assignments", type: "assignments", score: 0 }],
    ["deberes", { id: "assignments", type: "assignments", score: 0 }],
    ["que hay que hacer", { id: "assignments", type: "assignments", score: 0 }],
    ["entregas pendientes", { id: "assignments", type: "assignments", score: 0 }],
    ["que me falta por entregar", { id: "assignments", type: "assignments", score: 0 }],
    ["tareas sin hacer", { id: "assignments", type: "assignments", score: 0 }],
    ["actividades pendientes", { id: "assignments", type: "assignments", score: 0 }],
    ["que tengo que hacer", { id: "assignments", type: "assignments", score: 0 }],
    ["algo que entregar", { id: "assignments", type: "assignments", score: 0 }],
    ["cosas por hacer", { id: "assignments", type: "assignments", score: 0 }],
    ["practicas pendientes", { id: "assignments", type: "assignments", score: 0 }],

    // ── Eventos / Exámenes ──
    ["proximos examenes", { id: "events", type: "events", score: 0 }],
    ["cuando es el examen", { id: "events", type: "events", score: 0 }],
    ["fechas de examenes", { id: "events", type: "events", score: 0 }],
    ["cuando tengo examen", { id: "events", type: "events", score: 0 }],
    ["calendario de examenes", { id: "events", type: "events", score: 0 }],
    ["cuando es el parcial", { id: "events", type: "events", score: 0 }],
    ["cuando es el final", { id: "events", type: "events", score: 0 }],
    ["proximos eventos", { id: "events", type: "events", score: 0 }],
    ["agenda", { id: "events", type: "events", score: 0 }],

    // ── Horario / Tiempo ──
    ["que tengo hoy", { id: "overview_today", type: "overview", score: 0 }],
    ["clases de hoy", { id: "overview_today", type: "overview", score: 0 }],
    ["que toca hoy", { id: "overview_today", type: "overview", score: 0 }],
    ["que tengo manana", { id: "overview_tomorrow", type: "overview", score: 0 }],
    ["clases de manana", { id: "overview_tomorrow", type: "overview", score: 0 }],
    ["que tengo esta semana", { id: "overview_week", type: "overview", score: 0 }],
    ["horario semanal", { id: "overview_week", type: "overview", score: 0 }],
    ["mi semana", { id: "overview_week", type: "overview", score: 0 }],

    // ── Cursos ──
    ["mis cursos", { id: "courses", type: "courses", score: 0 }],
    ["mis asignaturas", { id: "courses", type: "courses", score: 0 }],
    ["en que estoy matriculado", { id: "courses", type: "courses", score: 0 }],
    ["que asignaturas tengo", { id: "courses", type: "courses", score: 0 }],
    ["lista de cursos", { id: "courses", type: "courses", score: 0 }],

    // ── Anuncios ──
    ["anuncios", { id: "announcements", type: "announcements", score: 0 }],
    ["ultimos anuncios", { id: "announcements", type: "announcements", score: 0 }],
    ["avisos de profesores", { id: "announcements", type: "announcements", score: 0 }],
    ["que hay de nuevo", { id: "announcements", type: "announcements", score: 0 }],
    ["novedades", { id: "announcements", type: "announcements", score: 0 }],
    ["ha dicho algo el profesor", { id: "announcements", type: "announcements", score: 0 }],
    ["ha publicado algo el profesor", { id: "announcements", type: "announcements", score: 0 }],
    ["ha subido algo el profesor", { id: "announcements", type: "announcements", score: 0 }],

    // ── Archivos ──
    ["archivos", { id: "files", type: "files", score: 0 }],
    ["apuntes", { id: "files", type: "files", score: 0 }],
    ["materiales", { id: "files", type: "files", score: 0 }],
    ["documentos", { id: "files", type: "files", score: 0 }],
    ["dame los apuntes", { id: "files", type: "files", score: 0 }],
    ["pasame los archivos", { id: "files", type: "files", score: 0 }],

    // ── Resumen / Overview ──
    ["resumen", { id: "overview", type: "overview", score: 0 }],
    ["ponme al dia", { id: "overview", type: "overview", score: 0 }],
    ["como va todo", { id: "overview", type: "overview", score: 0 }],
    ["que me espera", { id: "overview", type: "overview", score: 0 }],
    ["vista general", { id: "overview", type: "overview", score: 0 }],
    ["que hay", { id: "overview", type: "overview", score: 0 }],
    ["que tengo", { id: "overview", type: "overview", score: 0 }],

    // ── Ayuda ──
    ["ayuda", { id: "help", type: "help", score: 0 }],
    ["que puedes hacer", { id: "help", type: "help", score: 0 }],
    ["como funciona esto", { id: "help", type: "help", score: 0 }],
    ["que opciones tengo", { id: "help", type: "help", score: 0 }],
    ["como te uso", { id: "help", type: "help", score: 0 }],

    // ── Saludos ──
    ["hola", { id: "greeting", type: "greeting", score: 0 }],
    ["buenos dias", { id: "greeting", type: "greeting", score: 0 }],
    ["buenas tardes", { id: "greeting", type: "greeting", score: 0 }],
    ["buenas noches", { id: "greeting", type: "greeting", score: 0 }],
    ["que tal", { id: "greeting", type: "greeting", score: 0 }],
    ["como estas", { id: "greeting", type: "greeting", score: 0 }],

    // ── Agradecimiento / Despedida ──
    ["gracias", { id: "thanks", type: "thanks", score: 0 }],
    ["muchas gracias", { id: "thanks", type: "thanks", score: 0 }],
    ["vale gracias", { id: "thanks", type: "thanks", score: 0 }],
    ["perfecto gracias", { id: "thanks", type: "thanks", score: 0 }],
    ["adios", { id: "goodbye", type: "goodbye", score: 0 }],
    ["hasta luego", { id: "goodbye", type: "goodbye", score: 0 }],
    ["nos vemos", { id: "goodbye", type: "goodbye", score: 0 }],
    ["chao", { id: "goodbye", type: "goodbye", score: 0 }],

    // ── Cuenta ──
    ["mi cuenta", { id: "link", type: "link", score: 0 }],
    ["estoy vinculado", { id: "link", type: "link", score: 0 }],
    ["estado de la cuenta", { id: "link", type: "link", score: 0 }],
  ];

  return entries.map(([phrase, intent]) => ({
    norm: normalize(phrase),
    intent,
  }));
}

const FUZZY_THRESHOLD = 0.55;

function detectIntentTier2(message: string): MatchedIntent | null {
  const input = normalize(message);
  if (input.length < 2) return null;

  let best: { intent: MatchedIntent; score: number } | null = null;

  for (const entry of FUZZY_CATALOG) {
    const score = diceCoefficient(input, entry.norm);
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
      best = {
        intent: { ...entry.intent, score, courseHint: extractCourseHint(message) },
        score,
      };
    }
  }

  return best ? best.intent : null;
}

// ── Text utilities ──

/** Strip accents, punctuation, collapse whitespace */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[¿?¡!.,;:()\"']/g, "") // strip punctuation
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Dice coefficient for string similarity (0-1) */
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.substring(i, i + 2));

  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.substring(i, i + 2));

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

function extractCourseHint(message: string): string | undefined {
  const m = message.match(/\b(?:de|en|para)\s+([^,;:!?\n]+)/i);
  if (m) {
    let hint = m[1].trim();
    hint = hint.replace(/\b(por favor|please|gracias|pls)\b.*$/i, "").trim();
    if (hint.length > 2) return hint;
  }
  return undefined;
}

function matchCourses(courses: Course[], hint: string): Course[] {
  const h = hint.toLowerCase();
  return courses.filter(
    (c) => c.name.toLowerCase().includes(h) || c.course_code.toLowerCase().includes(h),
  );
}

function formatDateMadrid(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================
// Intent dispatcher + handlers
// ============================================

async function handleIntent(intent: MatchedIntent, canvas: CanvasClient): Promise<BotResponse> {
  switch (intent.type) {
    case "greeting":
      return { text: "¡Hola! ¿En qué puedo ayudarte hoy?\n\nEscribe **\"ayuda\"** para ver lo que puedo hacer.", resolvedBy: "system" };
    case "thanks":
      return { text: randomPick(THANKS_RESPONSES), resolvedBy: "system" };
    case "goodbye":
      return { text: randomPick(GOODBYE_RESPONSES), resolvedBy: "system" };
    case "help":
      return {
        text:
          "**Puedo ayudarte con:**\n\n" +
          '📚 **"Mis cursos"** — ver tus asignaturas\n' +
          '📊 **"Mis notas"** — consultar calificaciones\n' +
          '📝 **"Tareas pendientes"** — ver entregas próximas\n' +
          '📅 **"Eventos"** — consultar tu calendario\n' +
          '📢 **"Anuncios"** — ver noticias de tus cursos\n' +
          '📁 **"Archivos"** — ver materiales de tus cursos\n' +
          '📋 **"Resumen"** — vista general de pendientes\n' +
          '📅 **"Qué tengo hoy"** — agenda del día\n\n' +
          "También puedo responder preguntas más complejas sobre tus asignaturas.",
        resolvedBy: "system",
      };
    case "link":
      return {
        text: "Tu cuenta de Canvas ya está vinculada. Si necesitas actualizar tu token, ve a **Ajustes**.",
        resolvedBy: "system",
      };
    case "courses":
      return await handleCoursesIntent(canvas);
    case "grades":
      return await handleGradesIntent(canvas, intent.courseHint);
    case "assignments":
      return await handleAssignmentsIntent(canvas, intent.courseHint);
    case "events":
      return await handleEventsIntent(canvas);
    case "announcements":
      return await handleAnnouncementsIntent(canvas);
    case "files":
      return await handleFilesIntent(canvas, intent.courseHint);
    case "overview":
      return await handleOverviewIntent(canvas);
    default:
      return await handleOverviewIntent(canvas);
  }
}

const THANKS_RESPONSES = [
  "¡De nada! Si necesitas algo más, aquí estoy.",
  "¡Para eso estoy! No dudes en preguntarme lo que sea.",
  "¡Un placer! Aquí me tienes si necesitas algo más.",
];

const GOODBYE_RESPONSES = [
  "¡Hasta luego! Mucho ánimo con los estudios.",
  "¡Nos vemos! Aquí estaré cuando me necesites.",
  "¡Cuídate! Suerte con todo.",
];

function randomPick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Canvas intent handlers ──

async function handleCoursesIntent(canvas: CanvasClient): Promise<BotResponse> {
  const courses = await canvas.getCourses();
  if (courses.length === 0) {
    return { text: "No tienes cursos activos en Canvas.", resolvedBy: "system" };
  }
  const lines = courses.map((c) => `📚 **${c.name}** (${c.course_code})`);
  return {
    text: `Tienes **${courses.length} curso${courses.length !== 1 ? "s" : ""} activo${courses.length !== 1 ? "s" : ""}**:\n\n${lines.join("\n")}`,
    resolvedBy: "system",
  };
}

async function handleGradesIntent(canvas: CanvasClient, courseHint?: string): Promise<BotResponse> {
  const courses = await canvas.getCourses();
  let targets = courses;
  if (courseHint) {
    const matched = matchCourses(courses, courseHint);
    if (matched.length > 0) targets = matched;
  }

  const results = await Promise.all(
    targets.map(async (c) => {
      try {
        return { course: c, grades: await canvas.getGrades(c.id) };
      } catch {
        return { course: c, grades: null };
      }
    }),
  );

  const lines = results.map(({ course, grades }) => {
    if (!grades || grades.current_score === null) {
      return `📚 **${course.name}**: Sin calificación aún`;
    }
    const nota = (grades.current_score / 10).toFixed(1);
    return `📚 **${course.name}**: **${nota} / 10**`;
  });

  return {
    text: `📊 **Tus calificaciones:**\n\n${lines.join("\n")}`,
    resolvedBy: "system",
  };
}

async function handleAssignmentsIntent(canvas: CanvasClient, courseHint?: string): Promise<BotResponse> {
  const courses = await canvas.getCourses();
  let targets = courses;
  if (courseHint) {
    const matched = matchCourses(courses, courseHint);
    if (matched.length > 0) targets = matched;
  }

  const results = await Promise.all(
    targets.map(async (c) => {
      try {
        const assignments = await canvas.getAssignments(c.id, true);
        return assignments.map((a) => ({ ...a, courseName: c.name }));
      } catch {
        return [];
      }
    }),
  );

  const all = results.flat();
  all.sort((a, b) => {
    if (!a.due_at && !b.due_at) return 0;
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  });

  if (all.length === 0) {
    return { text: "¡No tienes tareas pendientes!", resolvedBy: "system" };
  }

  const shown = all.slice(0, 7);
  const lines = shown.map((a) => {
    const date = a.due_at ? formatDateMadrid(a.due_at) : "sin fecha límite";
    return `📝 **${a.name}** (${a.courseName})\n   Entrega: ${date}`;
  });

  let text = `📝 **Tareas pendientes (${all.length}):**\n\n${lines.join("\n\n")}`;
  if (all.length > 7) {
    text += `\n\n...y ${all.length - 7} más. Pregúntame por un curso específico para ver todas.`;
  }

  return { text, resolvedBy: "system" };
}

async function handleEventsIntent(canvas: CanvasClient): Promise<BotResponse> {
  const events = await canvas.getUpcomingEvents();

  if (events.length === 0) {
    return { text: "📅 No tienes eventos próximos en tu calendario de Canvas.", resolvedBy: "system" };
  }

  const shown = events.slice(0, 7);
  const lines = shown.map((e) => {
    const date = e.start_at ? formatDateMadrid(e.start_at) : "sin fecha";
    const course = e.course_name ? ` (${e.course_name})` : "";
    return `📅 **${e.title}**${course}\n   ${date}`;
  });

  let text = `📅 **Próximos eventos (${events.length}):**\n\n${lines.join("\n\n")}`;
  if (events.length > 7) {
    text += `\n\n...y ${events.length - 7} más.`;
  }

  return { text, resolvedBy: "system" };
}

async function handleAnnouncementsIntent(canvas: CanvasClient): Promise<BotResponse> {
  const courses = await canvas.getCourses();
  const courseIds = courses.map((c) => c.id);

  if (courseIds.length === 0) {
    return { text: "No tienes cursos activos para consultar anuncios.", resolvedBy: "system" };
  }

  const announcements = await canvas.getAnnouncements(courseIds);

  if (announcements.length === 0) {
    return { text: "📢 No hay anuncios recientes en tus cursos.", resolvedBy: "system" };
  }

  const shown = announcements.slice(0, 5);
  const lines = shown.map((a) => {
    const date = a.posted_at ? formatDateMadrid(a.posted_at) : "";
    const link = a.url ? ` [Ver](${a.url})` : "";
    return `📢 **${a.title}**\n   ${date}${link}`;
  });

  let text = `📢 **Anuncios recientes:**\n\n${lines.join("\n\n")}`;
  if (announcements.length > 5) {
    text += `\n\n...y ${announcements.length - 5} más.`;
  }

  return { text, resolvedBy: "system" };
}

async function handleFilesIntent(canvas: CanvasClient, courseHint?: string): Promise<BotResponse> {
  const courses = await canvas.getCourses();

  if (courseHint) {
    const matched = matchCourses(courses, courseHint);
    if (matched.length === 1) {
      const course = matched[0];
      const files = await canvas.getCourseFiles(course.id);
      if (files.length === 0) {
        return { text: `📁 No hay archivos en **${course.name}**.`, resolvedBy: "system" };
      }
      const shown = files.slice(0, 10);
      const lines = shown.map((f) => {
        const size = f.size > 0 ? ` (${(f.size / 1024).toFixed(0)} KB)` : "";
        return `📄 **${f.display_name}**${size}`;
      });
      let text = `📁 **Archivos de ${course.name}** (${files.length}):\n\n${lines.join("\n")}`;
      if (files.length > 10) {
        text += `\n\n...y ${files.length - 10} más.`;
      }
      return { text, resolvedBy: "system" };
    }
    if (matched.length > 1) {
      const options = matched.map((c) => `📚 **${c.name}**`);
      return {
        text: `Hay varios cursos que coinciden. ¿Cuál?\n\n${options.join("\n")}`,
        resolvedBy: "system",
      };
    }
  }

  const options = courses.map((c) => `📚 **${c.name}**`);
  return {
    text: `📁 ¿De qué curso quieres ver los archivos?\n\n${options.join("\n")}`,
    resolvedBy: "system",
  };
}

async function handleOverviewIntent(canvas: CanvasClient): Promise<BotResponse> {
  const courses = await canvas.getCourses();

  const [assignmentResults, events] = await Promise.all([
    Promise.all(
      courses.map(async (c) => {
        try {
          const assignments = await canvas.getAssignments(c.id, true);
          return assignments.map((a) => ({ ...a, courseName: c.name }));
        } catch {
          return [];
        }
      }),
    ),
    canvas.getUpcomingEvents(),
  ]);

  const pending = assignmentResults.flat();
  pending.sort((a, b) => {
    if (!a.due_at && !b.due_at) return 0;
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  });

  const parts: string[] = [];

  if (pending.length === 0) {
    parts.push("📝 **Tareas:** No tienes tareas pendientes.");
  } else {
    const top = pending.slice(0, 3);
    const lines = top.map((a) => {
      const date = a.due_at ? formatDateMadrid(a.due_at) : "sin fecha";
      return `  📝 ${a.name} (${a.courseName}) — ${date}`;
    });
    parts.push(`📝 **Tareas pendientes (${pending.length}):**\n${lines.join("\n")}`);
    if (pending.length > 3) {
      parts.push(`  ...y ${pending.length - 3} más. Escribe **"tareas"** para verlas todas.`);
    }
  }

  if (events.length === 0) {
    parts.push("📅 **Eventos:** No hay eventos próximos.");
  } else {
    const top = events.slice(0, 3);
    const lines = top.map((e) => {
      const date = e.start_at ? formatDateMadrid(e.start_at) : "sin fecha";
      const course = e.course_name ? ` (${e.course_name})` : "";
      return `  📅 ${e.title}${course} — ${date}`;
    });
    parts.push(`📅 **Próximos eventos (${events.length}):**\n${lines.join("\n")}`);
  }

  return {
    text: `📋 **Tu resumen:**\n\n${parts.join("\n\n")}`,
    resolvedBy: "system",
  };
}
