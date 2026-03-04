import { normalize, expandAbbreviations } from "./normalizer";
import { classifyIntent } from "./intent-classifier";
import type { ConversationMessage } from "../db/schema";

// Patterns that indicate a follow-up referencing something from the previous turn
const FOLLOW_UP_PATTERNS = [
  /^y (?:de|del|los de|las de|lo de|la de) (.+)/,   // "y de mates?", "y los de física?"
  /^tambien (?:de|del) (.+)/,                         // "también de matemáticas"
  /^lo mismo (?:de|del|para) (.+)/,                   // "lo mismo de física"
  /^(?:que tal|como van|que hay en) (.+)/,             // "qué tal matemáticas"
  /^(?:y en|y para) (.+)/,                             // "y en física?"
];

// Short affirmations that confirm a previous bot suggestion
const AFFIRMATIONS = ["si", "sip", "vale", "ok", "dale", "venga", "claro", "porfa", "por favor", "eso"];

/**
 * Attempts to resolve a follow-up message by looking at conversation history.
 * Returns the "expanded" message if a follow-up is detected, or null if not.
 *
 * Example: history has "tareas de física" → user says "y de mates?" → returns "tareas de matematicas"
 */
export function resolveContext(message: string, history: ConversationMessage[]): string | null {
  if (history.length === 0) return null;

  const normalized = normalize(expandAbbreviations(normalize(message.trim())));

  // Find the last user message that had a clear intent (not this one)
  const lastUserMessages = history.filter((m) => m.role === "user");
  if (lastUserMessages.length === 0) return null;

  const lastUserMsg = lastUserMessages[lastUserMessages.length - 1];
  const lastNormalized = normalize(expandAbbreviations(normalize(lastUserMsg.content.trim())));
  const lastIntent = classifyIntent(lastNormalized);

  // 1. Check follow-up patterns: "y de X?"
  for (const pattern of FOLLOW_UP_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      const newSubject = match[1].trim();
      // Reuse the last intent's verb/action with the new subject
      const intentVerb = extractIntentVerb(lastIntent.type);
      if (intentVerb) {
        const expanded = `${intentVerb} de ${newSubject}`;
        console.log(`[CTX] Follow-up resolved: "${message}" → "${expanded}"`);
        return expanded;
      }
    }
  }

  // 2. Check if it's a short message with just a course name (no verb)
  //    e.g., user previously asked "tareas de física", now says "matemáticas"
  //    Only triggers if last intent was course-specific (assignments, grades, etc.)
  const COURSE_INTENTS = ["assignments", "grades", "announcements", "files"];
  if (
    normalized.split(" ").length <= 2 &&
    COURSE_INTENTS.includes(lastIntent.type)
  ) {
    const currentIntent = classifyIntent(normalized);
    if (currentIntent.type === "unknown") {
      const intentVerb = extractIntentVerb(lastIntent.type);
      if (intentVerb) {
        const expanded = `${intentVerb} de ${normalized}`;
        console.log(`[CTX] Short follow-up resolved: "${message}" → "${expanded}"`);
        return expanded;
      }
    }
  }

  // 3. Check affirmations after a bot question (e.g., bot asked "¿De qué curso?")
  if (AFFIRMATIONS.includes(normalized)) {
    // Look at the last assistant message
    const lastAssistantMessages = history.filter((m) => m.role === "assistant");
    if (lastAssistantMessages.length > 0) {
      const lastBotMsg = lastAssistantMessages[lastAssistantMessages.length - 1];
      // If bot was asking for clarification, we can't easily resolve — let Tier 3 handle it
      console.log(`[CTX] Affirmation detected: "${message}" — deferring to LLM with context`);
      return null;
    }
  }

  return null;
}

function extractIntentVerb(intentType: string): string | null {
  switch (intentType) {
    case "assignments": return "tareas";
    case "grades": return "notas";
    case "calendar": return "calendario";
    case "announcements": return "anuncios";
    case "files": return "archivos";
    case "courses": return "cursos";
    default: return null;
  }
}
