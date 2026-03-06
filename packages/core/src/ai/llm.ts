import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./system-prompt";
import { CanvasClient, TokenExpiredError } from "../canvas/client";
import type { ConversationMessage } from "../types/conversation";
import type { Course } from "../types/canvas";

const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ITERATIONS = 6;

/** Raw file data collected during tool execution */
export interface CollectedFile {
  id: number;
  name: string;
  size: number;
  contentType: string;
  updatedAt: string;
}

export interface LLMResult {
  text: string;
  files: CollectedFile[];
}

export interface LLMProvider {
  processMessage(message: string, canvas: CanvasClient, history?: ConversationMessage[]): Promise<string>;
  processMessageRich(message: string, canvas: CanvasClient, history?: ConversationMessage[]): Promise<LLMResult>;
}

/**
 * Ensures messages alternate between user and assistant roles.
 */
function ensureAlternation(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;

  const result: Anthropic.MessageParam[] = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const prev = result[result.length - 1];
    const curr = messages[i];
    if (prev.role === curr.role) {
      const prevText = typeof prev.content === "string" ? prev.content : "";
      const currText = typeof curr.content === "string" ? curr.content : "";
      result[result.length - 1] = { role: prev.role, content: `${prevText}\n\n${currText}` };
    } else {
      result.push(curr);
    }
  }

  if (result.length > 0 && result[0].role !== "user") {
    result.shift();
  }

  return result;
}

/**
 * Better token estimation (Phase 7):
 * ~5 chars/token for Spanish text, ~3.5 chars/token for JSON
 */
function estimateCharsPerToken(content: string): number {
  // Heuristic: if content looks like JSON (starts with [ or {), use lower ratio
  const trimmed = content.trimStart();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return 3.5;
  }
  return 5; // Spanish text averages ~5 chars per token
}

function trimHistoryToTokenBudget(history: ConversationMessage[], budgetTokens: number): ConversationMessage[] {
  let totalTokens = 0;
  const result: ConversationMessage[] = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const charsPerToken = estimateCharsPerToken(history[i].content);
    const msgTokens = Math.ceil(history[i].content.length / charsPerToken);
    if (totalTokens + msgTokens > budgetTokens) break;
    totalTokens += msgTokens;
    result.unshift(history[i]);
  }

  return result;
}

function buildMessages(userMessage: string, maxTokens: number, history?: ConversationMessage[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  if (history && history.length > 0) {
    const trimmed = trimHistoryToTokenBudget(history, Math.floor(maxTokens * 0.75));
    for (const msg of trimmed) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: "user", content: userMessage });
  return ensureAlternation(messages);
}

// --- Tool definitions ---

const tools: Anthropic.Tool[] = [
  {
    name: "get_courses",
    description:
      "Lista todos los cursos activos del estudiante en Canvas LMS. Llama a esta herramienta primero si necesitas encontrar el ID de un curso. Devuelve id, nombre y código de cada curso.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_assignments",
    description:
      "Lista las tareas de un curso específico. Usa only_pending=true para obtener solo tareas con fecha de entrega futura (recomendado cuando el usuario pregunta por entregas próximas o pendientes).",
    input_schema: {
      type: "object" as const,
      properties: {
        course_id: { type: "number", description: "ID del curso en Canvas" },
        only_pending: { type: "boolean", description: "Si true, solo devuelve tareas con entrega futura." },
      },
      required: ["course_id"],
    },
  },
  {
    name: "get_grades",
    description:
      "Obtiene las calificaciones del estudiante en un curso específico. Devuelve nota_sobre_10 (escala española), nota_porcentaje (0-100), nota_letra y nota_final. Muestra al usuario la nota sobre 10.",
    input_schema: {
      type: "object" as const,
      properties: { course_id: { type: "number", description: "ID del curso en Canvas" } },
      required: ["course_id"],
    },
  },
  {
    name: "get_upcoming_events",
    description:
      "Lista los próximos eventos del calendario del estudiante (exámenes, entregas, clases especiales).",
    input_schema: {
      type: "object" as const,
      properties: { days: { type: "number", description: "Número de días a consultar (por defecto 7)" } },
      required: [],
    },
  },
  {
    name: "get_announcements",
    description:
      "Obtiene los anuncios más recientes de todos los cursos del estudiante.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_course_files",
    description:
      "Lista los archivos más recientes subidos a un curso (apuntes, materiales, PDFs). Para navegar carpetas específicas, usa get_course_folders en su lugar.",
    input_schema: {
      type: "object" as const,
      properties: { course_id: { type: "number", description: "ID del curso en Canvas" } },
      required: ["course_id"],
    },
  },
  {
    name: "get_course_folders",
    description:
      "Lista todas las carpetas de un curso. Úsalo para navegar la estructura de archivos del curso. Devuelve id, nombre, ruta completa, número de archivos y subcarpetas.",
    input_schema: {
      type: "object" as const,
      properties: { course_id: { type: "number", description: "ID del curso en Canvas" } },
      required: ["course_id"],
    },
  },
  {
    name: "get_folder_files",
    description:
      "Lista los archivos dentro de una carpeta específica. Usa get_course_folders primero para obtener el folder_id.",
    input_schema: {
      type: "object" as const,
      properties: { folder_id: { type: "number", description: "ID de la carpeta en Canvas" } },
      required: ["folder_id"],
    },
  },
  {
    name: "get_file_download_url",
    description:
      "Obtiene la URL pública de descarga de un archivo. Usa get_course_files o get_folder_files primero para obtener el file_id.",
    input_schema: {
      type: "object" as const,
      properties: { file_id: { type: "number", description: "ID del archivo en Canvas" } },
      required: ["file_id"],
    },
  },
  {
    name: "get_folder_subfolders",
    description:
      "Lista las subcarpetas dentro de una carpeta. Úsalo para navegar dentro de una carpeta que contiene más carpetas.",
    input_schema: {
      type: "object" as const,
      properties: { folder_id: { type: "number", description: "ID de la carpeta en Canvas" } },
      required: ["folder_id"],
    },
  },
];

// --- Date/grade formatting helpers for tool results ---

const TZ = "Europe/Madrid";

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("es-ES", {
      timeZone: TZ,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDateShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      timeZone: TZ,
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function fmtSize(bytes: unknown): string {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function stripHtml(html: string | null | undefined, maxLen = 500): string | null {
  if (!html) return null;
  return html.replace(/<[^>]*>/g, "").trim().slice(0, maxLen) || null;
}

// --- Tool result compression ---

function compressToolResult(toolName: string, rawJson: string): string {
  try {
    const data = JSON.parse(rawJson);

    switch (toolName) {
      case "get_courses": {
        const courses = Array.isArray(data) ? data : [];
        return JSON.stringify(
          courses.map((c: Record<string, unknown>) => ({
            id: c.id,
            name: c.name,
            code: c.course_code,
          }))
        );
      }
      case "get_assignments": {
        const assignments = Array.isArray(data) ? data.slice(0, 15) : [];
        return JSON.stringify(
          assignments.map((a: Record<string, unknown>) => ({
            id: a.id,
            name: a.name,
            due: fmtDate(a.due_at as string | null),
            points: a.points_possible,
            types: a.submission_types,
            url: a.html_url,
            desc: stripHtml(a.description as string | null),
            lock: fmtDate(a.lock_at as string | null),
          }))
        );
      }
      case "get_grades": {
        // Convert Canvas percentage to /10 for the LLM
        if (data && typeof data === "object" && !Array.isArray(data)) {
          const g = data as Record<string, unknown>;
          const score = g.current_score as number | null;
          return JSON.stringify({
            course_name: g.course_name,
            nota_sobre_10: score !== null ? Math.round((score as number) / 10 * 10) / 10 : null,
            nota_porcentaje: score,
            nota_letra: g.current_grade,
            nota_final: g.final_score,
          });
        }
        return rawJson;
      }
      case "get_upcoming_events": {
        const events = Array.isArray(data) ? data.slice(0, 15) : [];
        return JSON.stringify(
          events.map((e: Record<string, unknown>) => ({
            title: e.title,
            start: fmtDate(e.start_at as string | null),
            end: fmtDate(e.end_at as string | null),
            course: e.course_name,
            type: e.type,
            desc: stripHtml(e.description as string | null, 300),
            location: e.location,
          }))
        );
      }
      case "get_announcements": {
        const anns = Array.isArray(data) ? data.slice(0, 10) : [];
        return JSON.stringify(
          anns.map((a: Record<string, unknown>) => ({
            title: a.title,
            message: stripHtml(a.message as string | null, 800),
            posted: fmtDateShort(a.posted_at as string | null),
            course: a.course_name,
            url: a.url,
          }))
        );
      }
      case "get_course_files":
      case "get_folder_files": {
        const files = Array.isArray(data) ? data.slice(0, 15) : [];
        return JSON.stringify(
          files.map((f: Record<string, unknown>) => ({
            id: f.id,
            name: f.display_name,
            size: fmtSize(f.size),
            type: f.content_type,
            updated: fmtDateShort(f.updated_at as string | null),
          }))
        );
      }
      case "get_course_folders":
      case "get_folder_subfolders": {
        const folders = Array.isArray(data) ? data : [];
        return JSON.stringify(
          folders.map((f: Record<string, unknown>) => ({
            id: f.id,
            name: f.name,
            path: f.full_name,
            files: f.files_count,
            subfolders: f.folders_count,
          }))
        );
      }
      case "get_file_download_url":
        return rawJson;
      default:
        return rawJson;
    }
  } catch {
    return rawJson;
  }
}

// --- Tool execution with per-turn caching (Phase 7) ---

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  canvas: CanvasClient,
  turnCache: Map<string, string>,
  collectedFiles?: CollectedFile[],
): Promise<string> {
  // Build cache key from tool name + input
  const cacheKey = `${name}:${JSON.stringify(input)}`;
  const cached = turnCache.get(cacheKey);
  if (cached) {
    console.log(`[AI] Tool cache hit: ${name}`);
    return cached;
  }

  console.log(`[AI] Tool call: ${name}`, Object.keys(input).length ? JSON.stringify(input) : "");

  let rawResult: string;
  switch (name) {
    case "get_courses":
      rawResult = JSON.stringify(await canvas.getCourses());
      break;
    case "get_assignments":
      rawResult = JSON.stringify(await canvas.getAssignments(input.course_id as number, (input.only_pending as boolean) ?? false));
      break;
    case "get_grades":
      rawResult = JSON.stringify(await canvas.getGrades(input.course_id as number));
      break;
    case "get_upcoming_events":
      rawResult = JSON.stringify(await canvas.getUpcomingEvents(input.days as number | undefined));
      break;
    case "get_announcements": {
      const courses = await canvas.getCourses();
      rawResult = JSON.stringify(await canvas.getAnnouncements(courses.map((c) => c.id)));
      break;
    }
    case "get_course_files":
      rawResult = JSON.stringify(await canvas.getCourseFiles(input.course_id as number));
      break;
    case "get_course_folders":
      rawResult = JSON.stringify(await canvas.getCourseFolders(input.course_id as number));
      break;
    case "get_folder_files":
      rawResult = JSON.stringify(await canvas.getFolderFiles(input.folder_id as number));
      break;
    case "get_file_download_url":
      rawResult = JSON.stringify(await canvas.getFileDownloadUrl(input.file_id as number));
      break;
    case "get_folder_subfolders":
      rawResult = JSON.stringify(await canvas.getFolderSubfolders(input.folder_id as number));
      break;
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  // Collect raw file data for structured metadata
  if (collectedFiles && (name === "get_course_files" || name === "get_folder_files")) {
    try {
      const files = JSON.parse(rawResult);
      if (Array.isArray(files)) {
        for (const f of files) {
          collectedFiles.push({
            id: f.id as number,
            name: (f.display_name as string) ?? "",
            size: (f.size as number) ?? 0,
            contentType: (f.content_type as string) ?? "",
            updatedAt: (f.updated_at as string) ?? "",
          });
        }
      }
    } catch { /* ignore parse errors */ }
  }

  const compressed = compressToolResult(name, rawResult);
  console.log(`[AI] Tool result compressed: ${rawResult.length} → ${compressed.length} chars`);
  turnCache.set(cacheKey, compressed);
  return compressed;
}

// --- Get cached courses for system prompt ---

async function getCachedCourses(canvas: CanvasClient): Promise<Course[] | undefined> {
  try {
    return await canvas.getCourses();
  } catch {
    return undefined;
  }
}

// --- LLM providers ---

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private maxTokens: number;
  private formatHint: string;
  private linkHint: string;

  constructor(
    apiKey: string,
    maxTokens = 4096,
    formatHint = '- Usa **negrita** para énfasis.\n- Usa emojis como viñetas (📚, ✅, 📅, etc.).',
    linkHint = 'Si el usuario no tiene cuenta vinculada, guíale para vincularla.',
  ) {
    this.client = new Anthropic({ apiKey });
    this.maxTokens = maxTokens;
    this.formatHint = formatHint;
    this.linkHint = linkHint;
  }

  async processMessage(userMessage: string, canvasClient: CanvasClient, history?: ConversationMessage[]): Promise<string> {
    const result = await this._process(userMessage, canvasClient, history);
    return result.text;
  }

  async processMessageRich(userMessage: string, canvasClient: CanvasClient, history?: ConversationMessage[]): Promise<LLMResult> {
    return this._process(userMessage, canvasClient, history);
  }

  private async _process(userMessage: string, canvasClient: CanvasClient, history?: ConversationMessage[]): Promise<LLMResult> {
    const start = Date.now();
    console.log(`[AI] Processing message with Claude (history: ${history?.length ?? 0} msgs)`);
    const messages = buildMessages(userMessage, this.maxTokens, history);

    const cachedCourses = await getCachedCourses(canvasClient);
    const systemPrompt = buildSystemPrompt(this.formatHint, this.linkHint, cachedCourses);

    // Per-turn tool result cache (Phase 7)
    const turnCache = new Map<string, string>();
    const collectedFiles: CollectedFile[] = [];

    try {
      let iterations = 0;

      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        const response = await this.client.messages.create({
          model: MODEL,
          max_tokens: this.maxTokens,
          system: systemPrompt,
          tools,
          messages,
        });

        if (response.stop_reason === "end_turn") {
          const text = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("\n");
          console.log(`[AI] Claude responded in ${Date.now() - start}ms (${iterations} iteration(s))`);
          return { text: text || "No tengo respuesta para eso.", files: collectedFiles };
        }

        if (response.stop_reason === "tool_use") {
          messages.push({ role: "assistant", content: response.content });

          const toolBlocks = response.content.filter((b) => b.type === "tool_use");
          console.log(`[AI] Iteration ${iterations}: ${toolBlocks.length} tool call(s) in parallel`);

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of response.content) {
            if (block.type !== "tool_use") continue;
            try {
              const result = await executeTool(block.name, block.input as Record<string, unknown>, canvasClient, turnCache, collectedFiles);
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
            } catch (err) {
              if (err instanceof TokenExpiredError) {
                return { text: "⚠️ Tu token de Canvas ha expirado o no es válido. Renuévalo en Canvas (Perfil > Configuración > Tokens de acceso).", files: [] };
              }
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify({ error: (err as Error).message }),
                is_error: true,
              });
            }
          }
          messages.push({ role: "user", content: toolResults });
          continue;
        }

        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        return { text: text || "No tengo respuesta para eso.", files: collectedFiles };
      }

      console.warn(`[AI] Max tool iterations (${MAX_TOOL_ITERATIONS}) reached after ${Date.now() - start}ms`);
      return { text: "😅 Necesité demasiadas consultas para responder. ¿Puedes reformular tu pregunta de forma más concreta?", files: [] };
    } catch (err) {
      const elapsed = Date.now() - start;
      const error = err as Record<string, unknown>;
      const status = error.status ?? error.statusCode ?? "unknown";
      const errType = error.name ?? error.constructor?.name ?? "Error";
      console.error(`[ERROR] Claude API failed after ${elapsed}ms: [${errType}] status=${status} ${(err as Error).message}`);

      // Provide more specific error messages based on error type
      if (status === 401 || status === 403) {
        return { text: "⚠️ Error de autenticación con el servicio de IA. Contacta al administrador.", files: [] };
      }
      if (status === 429) {
        return { text: "⏳ Demasiadas solicitudes al servicio de IA. Espera un momento e inténtalo de nuevo.", files: [] };
      }
      if (status === 529 || status === 503) {
        return { text: "🔧 El servicio de IA está temporalmente sobrecargado. Inténtalo en unos minutos.", files: [] };
      }
      return { text: "😅 Lo siento, estoy teniendo problemas técnicos. Inténtalo de nuevo en unos momentos.", files: [] };
    }
  }
}

export function createLLMProvider(
  apiKey?: string,
  maxTokens = 4096,
  formatHint?: string,
  linkHint?: string,
): LLMProvider | null {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (key) return new ClaudeProvider(key, maxTokens, formatHint, linkHint);
  return null;
}
