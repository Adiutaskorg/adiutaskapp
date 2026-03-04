import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./system-prompt";
import { CanvasClient, TokenExpiredError } from "../canvas/client";
import type { ConversationMessage } from "../services/conversation";
import type { Course } from "../canvas/types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ITERATIONS = 8;
const LLM_MAX_TOKENS = 2048;

export interface LLMProvider {
  processMessage(message: string, canvas: CanvasClient, history?: ConversationMessage[]): Promise<string>;
}

/**
 * Ensures messages alternate between user and assistant roles,
 * as required by the Anthropic API. Merges consecutive same-role messages.
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
 * Trims history to fit within a rough token budget.
 * Estimates ~4 chars per token. Keeps most recent messages.
 */
function trimHistoryToTokenBudget(history: ConversationMessage[], budgetTokens: number): ConversationMessage[] {
  const charBudget = budgetTokens * 4;
  let totalChars = 0;
  const result: ConversationMessage[] = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const msgChars = history[i].content.length;
    if (totalChars + msgChars > charBudget) break;
    totalChars += msgChars;
    result.unshift(history[i]);
  }

  return result;
}

function buildMessages(userMessage: string, history?: ConversationMessage[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  if (history && history.length > 0) {
    const trimmed = trimHistoryToTokenBudget(history, Math.floor(LLM_MAX_TOKENS * 0.75));
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
      "Obtiene las calificaciones del estudiante en un curso específico. Devuelve la nota actual (current_score), nota letra (current_grade) y nota final (final_score) si está disponible.",
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
      "Lista los archivos más recientes subidos a un curso (apuntes, materiales, PDFs).",
    input_schema: {
      type: "object" as const,
      properties: { course_id: { type: "number", description: "ID del curso en Canvas" } },
      required: ["course_id"],
    },
  },
];

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
            name: a.name,
            due: a.due_at,
            points: a.points_possible,
          }))
        );
      }

      case "get_grades": {
        return rawJson;
      }

      case "get_upcoming_events": {
        const events = Array.isArray(data) ? data.slice(0, 15) : [];
        return JSON.stringify(
          events.map((e: Record<string, unknown>) => ({
            title: e.title,
            start: e.start_at,
            end: e.end_at,
            course: e.course_name,
          }))
        );
      }

      case "get_announcements": {
        const anns = Array.isArray(data) ? data.slice(0, 10) : [];
        return JSON.stringify(
          anns.map((a: Record<string, unknown>) => ({
            title: a.title,
            message: typeof a.message === "string" ? a.message.slice(0, 300) : a.message,
            posted: a.posted_at,
            course: a.course_name,
          }))
        );
      }

      case "get_course_files": {
        const files = Array.isArray(data) ? data.slice(0, 15) : [];
        return JSON.stringify(
          files.map((f: Record<string, unknown>) => ({
            name: f.display_name,
            size: f.size,
            updated: f.updated_at,
          }))
        );
      }

      default:
        return rawJson;
    }
  } catch {
    return rawJson;
  }
}

// --- Tool execution ---

async function executeTool(name: string, input: Record<string, unknown>, canvas: CanvasClient): Promise<string> {
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
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  const compressed = compressToolResult(name, rawResult);
  console.log(`[AI] Tool result compressed: ${rawResult.length} → ${compressed.length} chars`);
  return compressed;
}

// --- Try to get cached courses for the system prompt ---

async function getCachedCourses(canvas: CanvasClient): Promise<Course[] | undefined> {
  try {
    return await canvas.getCourses();
  } catch {
    return undefined;
  }
}

// --- LLM provider ---

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async processMessage(userMessage: string, canvasClient: CanvasClient, history?: ConversationMessage[]): Promise<string> {
    const start = Date.now();
    console.log(`[AI] Processing message with Claude (history: ${history?.length ?? 0} msgs)`);
    const messages = buildMessages(userMessage, history);

    // Build dynamic system prompt with date and cached courses
    const cachedCourses = await getCachedCourses(canvasClient);
    const systemPrompt = buildSystemPrompt(cachedCourses);

    try {
      let iterations = 0;

      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        const response = await this.client.messages.create({
          model: MODEL,
          max_tokens: LLM_MAX_TOKENS,
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
          return text || "No tengo respuesta para eso.";
        }

        if (response.stop_reason === "tool_use") {
          messages.push({ role: "assistant", content: response.content });

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of response.content) {
            if (block.type !== "tool_use") continue;
            try {
              const result = await executeTool(block.name, block.input as Record<string, unknown>, canvasClient);
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
            } catch (err) {
              if (err instanceof TokenExpiredError) {
                return "⚠️ Tu token de Canvas ha expirado o no es válido. Renuévalo en Canvas (Perfil > Configuración > Tokens de acceso) y escribe **vincular** para actualizarlo.";
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

        // Unexpected stop reason
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        return text || "No tengo respuesta para eso.";
      }

      // Max iterations reached
      console.warn(`[AI] Max tool iterations (${MAX_TOOL_ITERATIONS}) reached after ${Date.now() - start}ms`);
      return "😅 Necesité demasiadas consultas para responder. ¿Puedes reformular tu pregunta de forma más concreta?";
    } catch (err) {
      console.error(`[ERROR] Claude API failed after ${Date.now() - start}ms:`, (err as Error).message);
      return "😅 Lo siento, estoy teniendo problemas técnicos. Inténtalo de nuevo en unos momentos.";
    }
  }
}

export function createLLMProvider(): LLMProvider | null {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) return new ClaudeProvider(anthropicKey);
  return null;
}
