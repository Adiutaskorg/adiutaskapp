// ============================================
// Bot Engine — Intent-first architecture
// Common queries resolved via Canvas API directly
// LLM used only as fallback for complex queries
// ============================================

import {
  CanvasClient, TokenExpiredError,
  createLLMProvider, type LLMProvider, type CollectedFile,
  type Course,
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
 * Process a user message — intent routing first, LLM as fallback.
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

  // --- Intent-based routing (skip LLM for common queries) ---
  const intent = detectIntent(trimmed);
  if (intent) {
    try {
      console.log(`[BOT] Intent: ${intent.type} (direct, no LLM)`);
      const directResponse = await handleIntent(intent, canvas);
      conversation.addMessage(userId, "user", message);
      conversation.addMessage(userId, "assistant", directResponse.text);
      return directResponse;
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        canvasClients.delete(userId);
        return {
          text: "Tu token de Canvas ha expirado o no es válido. Renuévalo en Canvas (Perfil > Configuración > Tokens de acceso) y escribe **\"vincular\"** para actualizarlo.",
          resolvedBy: "system",
          responseType: "error",
        };
      }
      // Non-fatal: fall through to LLM
      console.log(`[BOT] Intent handler failed, falling back to LLM: ${(err as Error).message}`);
    }
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

// ============================================
// Intent-based routing — resolves common
// queries directly via Canvas APIs (no LLM)
// ============================================

type Intent =
  | { type: "greeting" }
  | { type: "thanks" }
  | { type: "goodbye" }
  | { type: "help" }
  | { type: "link" }
  | { type: "courses" }
  | { type: "grades"; courseHint?: string }
  | { type: "assignments"; courseHint?: string }
  | { type: "events" }
  | { type: "announcements" }
  | { type: "files"; courseHint?: string }
  | { type: "overview" };

// --- Regex patterns (broad to minimize LLM fallback) ---

const COURSES_RE = /\b(mis\s*cursos|asignaturas|materias|qu[eé]\s*cursos|qu[eé]\s*estudio|listado?\s*de\s*cursos)\b/i;
const GRADES_RE = /\b(mis\s*notas|calificaciones?|notas?\b|qu[eé]\s*(nota|calificaci[oó]n)|c[oó]mo\s*voy|qu[eé]\s*saqu[eé]|qu[eé]\s*he\s*sacado|media|promedio|resultados?)\b/i;
const ASSIGNMENTS_RE = /\b(tareas?\s*(pendientes?)?|deberes|entregas?\s*(pendientes?)?|pr[aá]cticas?\s*(pendientes?)?|qu[eé]\s*(tengo|hay)\s*(que\s*entregar|pendiente)|algo\s*pendiente|pr[oó]xima\s*entrega|cu[aá]ndo\s*entrego|fecha\s*de\s*entrega|trabajos?\s*(pendientes?)?|actividad(es)?\s*(pendientes?)?|cosas?\s*(pendientes?|por\s*hacer|que\s*hacer))\b/i;
const EVENTS_RE = /\b(eventos?|calendario|ex[aá]me(n|nes)|agenda|pr[oó]xim(o|a|os|as)\s*(eventos?|entregas?|examen|ex[aá]menes)|cu[aá]ndo\s*(es|son|hay)\s*(el|los|un)?\s*(examen|parcial|final|prueba))\b/i;
const ANNOUNCEMENTS_RE = /\b(anuncios?|avisos?|noticias?|novedades?|qu[eé]\s*hay\s*de\s*nuevo)\b/i;
const FILES_RE = /\b(archivos?|documentos?|materiale?s?|ficheros?|pdfs?|apuntes?|recursos?|presentaci[oó]n(es)?|diapositivas?|temario|transparencias?)\b/i;
const OVERVIEW_RE = /\b(resumen|ponme\s*al\s*d[ií]a|c[oó]mo\s*va\s*todo|qu[eé]\s*me\s*(espera|queda|falta)|estado\s*(general|actual)|vista\s*general)\b/i;
const LINK_RE = /\b(vincular|conectar|enlazar|token)\b/i;
const GREETING_RE = /^(hola|hey|buenas|buenos?\s*(d[ií]as?|tardes?|noches?)|qu[eé]\s*tal|saludos|hi|hello|ey+|epa|wenas|qu[eé]\s*pasa|qu[eé]\s*hay|qu[eé]\s*onda)\b/i;
const THANKS_RE = /^(gracias|thanks?|genial|perfecto|guay|vale|ok[i]?|de\s*acuerdo|entendido|claro|mola|top|bien|excelente|estupendo|fenomenal|s[uú]per|incre[ií]ble|much[ia]s?\s*gracias)\b/i;
const GOODBYE_RE = /^(adi[oó]s|chao|bye|hasta\s*(luego|ma[nñ]ana|pronto|otra)|nos\s*vemos|me\s*voy|ya\s*est[aá]|eso\s*es\s*todo|nada\s*m[aá]s|cu[ií]date|chau)\b/i;
const HELP_RE = /\b(ayuda|help|qu[eé]\s*puedes\s*(hacer|decir)|men[uú]|opciones|comandos|c[oó]mo\s*(funciona|te\s*uso|va\s*esto))\b/i;

// Catch-all for very short messages that are likely simple interactions
const SHORT_CHITCHAT_RE = /^(s[ií]|no|ya|ok|lol|jaja[ja]*|jeje[je]*|xd+|wow|\?+|[.]+)$/i;

function detectIntent(message: string): Intent | null {
  const m = message.toLowerCase().trim();

  // 1. Canvas data intents (match anywhere, checked first)
  if (COURSES_RE.test(m)) return { type: "courses" };
  if (GRADES_RE.test(m)) return { type: "grades", courseHint: extractCourseHint(m) };
  if (ASSIGNMENTS_RE.test(m)) return { type: "assignments", courseHint: extractCourseHint(m) };
  if (EVENTS_RE.test(m)) return { type: "events" };
  if (ANNOUNCEMENTS_RE.test(m)) return { type: "announcements" };
  if (FILES_RE.test(m)) return { type: "files", courseHint: extractCourseHint(m) };
  if (OVERVIEW_RE.test(m)) return { type: "overview" };

  // 2. Account intents
  if (LINK_RE.test(m)) return { type: "link" };

  // 3. Chitchat / short interactions (no length limit)
  if (GREETING_RE.test(m)) return { type: "greeting" };
  if (THANKS_RE.test(m)) return { type: "thanks" };
  if (GOODBYE_RE.test(m)) return { type: "goodbye" };
  if (HELP_RE.test(m)) return { type: "help" };
  if (SHORT_CHITCHAT_RE.test(m)) return { type: "thanks" };

  // 4. Broad catch: short ambiguous queries → overview
  if (m.length <= 40 && /^(qu[eé]\s+(tengo|hay|me|tal)|d[ií]me|cu[eé]ntame|mu[eé]strame)/i.test(m)) {
    return { type: "overview" };
  }

  return null; // → LLM fallback
}

function extractCourseHint(message: string): string | undefined {
  const m = message.match(/\b(?:de|en)\s+([^,;:!?\n]+)/i);
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

// --- Intent dispatcher ---

async function handleIntent(intent: Intent, canvas: CanvasClient): Promise<BotResponse> {
  switch (intent.type) {
    case "greeting":
      return { text: "👋 ¡Hola! ¿En qué puedo ayudarte hoy?\n\nEscribe **\"ayuda\"** para ver lo que puedo hacer.", resolvedBy: "system" };
    case "thanks":
      return { text: "😊 ¡De nada! Si necesitas algo más, aquí estoy.", resolvedBy: "system" };
    case "goodbye":
      return { text: "👋 ¡Hasta luego! Mucho ánimo con los estudios.", resolvedBy: "system" };
    case "help":
      return {
        text:
          "📋 **Puedo ayudarte con:**\n\n" +
          '📚 **"Mis cursos"** — ver tus asignaturas\n' +
          '📊 **"Mis notas"** — consultar calificaciones\n' +
          '📝 **"Tareas pendientes"** — ver entregas próximas\n' +
          '📅 **"Eventos"** — consultar tu calendario\n' +
          '📢 **"Anuncios"** — ver noticias de tus cursos\n' +
          '📁 **"Archivos"** — ver materiales de tus cursos\n' +
          '📋 **"Resumen"** — vista general de pendientes\n\n' +
          "También puedo responder preguntas más complejas sobre tus asignaturas.",
        resolvedBy: "system",
      };
    case "link":
      return {
        text: "✅ Tu cuenta de Canvas ya está vinculada. Si necesitas actualizar tu token, ve a **Ajustes**.",
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
  }
}

// --- Canvas intent handlers ---

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
  // Sort by due date (soonest first, null = no deadline at end)
  all.sort((a, b) => {
    if (!a.due_at && !b.due_at) return 0;
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  });

  if (all.length === 0) {
    return { text: "✅ ¡No tienes tareas pendientes!", resolvedBy: "system" };
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

  // No hint or no match — list courses to choose
  const options = courses.map((c) => `📚 **${c.name}**`);
  return {
    text: `📁 ¿De qué curso quieres ver los archivos?\n\n${options.join("\n")}`,
    resolvedBy: "system",
  };
}

async function handleOverviewIntent(canvas: CanvasClient): Promise<BotResponse> {
  const courses = await canvas.getCourses();

  // Fetch pending assignments and events in parallel
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

  // Pending assignments summary
  if (pending.length === 0) {
    parts.push("✅ **Tareas:** No tienes tareas pendientes.");
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

  // Upcoming events summary
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
