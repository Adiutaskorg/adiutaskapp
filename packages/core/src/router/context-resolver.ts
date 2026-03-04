import { normalize, expandAbbreviations } from "./normalizer";
import { classifyIntent } from "./intent-classifier";
import type { ConversationMessage } from "../types/conversation";

// Patterns that indicate a follow-up referencing something from the previous turn
const FOLLOW_UP_PATTERNS = [
  /^y (?:de|del|los de|las de|lo de|la de) (.+)/,     // "y de mates?", "y los de física?"
  /^tambien (?:de|del) (.+)/,                           // "también de matemáticas"
  /^lo mismo (?:de|del|para) (.+)/,                     // "lo mismo de física"
  /^(?:que tal|como van|que hay en) (.+)/,               // "qué tal matemáticas"
  /^(?:y en|y para) (.+)/,                               // "y en física?"
  // New patterns (Phase 4)
  /^(?:sobre|ahora de|pues de|dame de|ahora) (.+)/,     // "sobre X", "ahora de X", "pues de X"
  /^(?:que hay de|que pasa con|que onda con) (.+)/,      // "qué hay de X"
  /^(?:y (?:el|la|los|las) de) (.+)/,                    // "y el de X", "y la de X"
];

// Short affirmations that confirm a previous bot suggestion
const AFFIRMATIONS = [
  "si", "sip", "sep", "vale", "ok", "dale", "venga", "claro",
  "porfa", "por favor", "eso", "eso mismo", "exacto", "correcto",
  "va", "vamos", "okey", "afirmativo",
];

// Pronoun patterns referencing last course
const PRONOUN_PATTERNS = [
  /(?:de (?:esa|ese|eso|la misma|el mismo)|de ahi|esa (?:materia|clase|asignatura)|ese (?:curso|ramo))/,
];

// Track last mentioned course per user (module-level cache)
const lastCourseByUser = new Map<string, string>();

/**
 * Save the last mentioned course for a user (for multi-turn tracking).
 */
export function setLastCourse(userId: string, courseName: string): void {
  lastCourseByUser.set(userId, courseName);
}

/**
 * Get the last mentioned course for a user.
 */
export function getLastCourse(userId: string): string | undefined {
  return lastCourseByUser.get(userId);
}

/**
 * Clear stored course for a user.
 */
export function clearLastCourse(userId: string): void {
  lastCourseByUser.delete(userId);
}

/**
 * Attempts to resolve a follow-up message by looking at conversation history.
 * Returns the "expanded" message if a follow-up is detected, or null if not.
 *
 * Example: history has "tareas de física" → user says "y de mates?" → returns "tareas de matematicas"
 */
export function resolveContext(
  message: string,
  history: ConversationMessage[],
  userId?: string,
): string | null {
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
      const intentVerb = extractIntentVerb(lastIntent.type);
      if (intentVerb) {
        const expanded = `${intentVerb} de ${newSubject}`;
        console.log(`[CTX] Follow-up resolved: "${message}" → "${expanded}"`);
        return expanded;
      }
    }
  }

  // 2. Pronoun resolution (Phase 4): "de esa asignatura", "de ese curso"
  const lastCourse = userId ? lastCourseByUser.get(userId) : undefined;
  if (lastCourse) {
    for (const pronounPattern of PRONOUN_PATTERNS) {
      if (pronounPattern.test(normalized)) {
        // Replace the pronoun reference with the actual course name
        const intentVerb = extractIntentVerb(lastIntent.type);
        const currentIntent = classifyIntent(normalized.replace(pronounPattern, "").trim());
        const verb = currentIntent.type !== "unknown"
          ? extractIntentVerb(currentIntent.type) ?? intentVerb
          : intentVerb;
        if (verb) {
          const expanded = `${verb} de ${lastCourse}`;
          console.log(`[CTX] Pronoun resolved: "${message}" → "${expanded}"`);
          return expanded;
        }
      }
    }
  }

  // 3. Check if it's a short message with just a course name (no verb)
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

  // 4. Intent-less message with known last course (Phase 4):
  //    "y las notas?" → user doesn't specify a course, reuse last known course
  if (lastCourse && userId) {
    const currentIntent = classifyIntent(normalized);
    if (
      currentIntent.type !== "unknown" &&
      COURSE_INTENTS.includes(currentIntent.type) &&
      !("courseName" in currentIntent && (currentIntent as { courseName?: string }).courseName)
    ) {
      // Check if the message doesn't explicitly contain a course reference
      const words = normalized.split(" ");
      const hasPreposition = words.some((w, i) =>
        (w === "de" || w === "en" || w === "para") && i < words.length - 1
      );
      if (!hasPreposition) {
        const intentVerb = extractIntentVerb(currentIntent.type);
        if (intentVerb) {
          const expanded = `${intentVerb} de ${lastCourse}`;
          console.log(`[CTX] Reusing last course: "${message}" → "${expanded}"`);
          return expanded;
        }
      }
    }
  }

  // 5. Affirmations: "sí", "vale" → repeat last intent (Phase 4)
  if (AFFIRMATIONS.includes(normalized)) {
    const REPEATABLE_INTENTS = ["assignments", "grades", "announcements", "files", "courses", "calendar"];
    if (REPEATABLE_INTENTS.includes(lastIntent.type)) {
      // Repeat the last user message (which had a clear intent)
      console.log(`[CTX] Affirmation repeats last intent: "${message}" → "${lastUserMsg.content}"`);
      return lastUserMsg.content;
    }
    // If not repeatable, defer to LLM
    console.log(`[CTX] Affirmation detected: "${message}" — deferring to LLM with context`);
    return null;
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
