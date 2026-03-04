import type { Intent, ClassifyResult } from "../types/intent";
export type { Intent, ClassifyResult } from "../types/intent";
import { levenshtein } from "./normalizer";

// A pattern matches if ANY of its keyword phrases are found in the message.
// A keyword phrase matches if ALL words in it appear in the message.
type PatternDef = {
  type: Intent["type"];
  keywords: string[];
  build?: (normalized: string) => Intent;
};

const URGENCY_WORDS = [
  "pendiente", "pendientes", "falta", "faltan", "entregar", "proxima", "proximo",
  "siguiente", "urgente", "para hoy", "para manana", "esta semana",
  "sin entregar", "atrasado", "atrasada", "vence", "vencimiento",
];

const DAY_NAMES: Record<string, number> = {
  "lunes": 1, "martes": 2, "miercoles": 3, "jueves": 4,
  "viernes": 5, "sabado": 6, "domingo": 0,
};

function detectDays(normalized: string): number {
  if (normalized.includes("hoy")) return 0;
  if (normalized.includes("mañana")) return 1;
  if (normalized.includes("proxima semana") || normalized.includes("siguiente semana")) return 14;
  if (normalized.includes("esta semana") || normalized.includes("semana")) return 7;

  for (const [name, target] of Object.entries(DAY_NAMES)) {
    if (normalized.includes(name)) {
      const today = new Date().getDay();
      let diff = target - today;
      if (diff <= 0) diff += 7;
      return diff;
    }
  }

  return 7;
}

function hasUrgency(normalized: string): boolean {
  return URGENCY_WORDS.some((w) => normalized.includes(w));
}

// Phrases that should go to LLM (Tier 3)
const FILE_EXTENSION_MAP: [string[], string][] = [
  [["pdf", "pdfs"], ".pdf"],
  [["presentacion", "presentaciones", "diapositiva", "diapositivas", "slides", "ppt"], ".pptx,.ppt"],
  [["excel", "excels", "hoja de calculo", "hojas de calculo"], ".xlsx,.xls"],
  [["word", "documento", "documentos", "doc"], ".docx,.doc"],
  [["imagen", "imagenes", "foto", "fotos"], ".jpg,.jpeg,.png,.gif"],
  [["video", "videos"], ".mp4,.avi,.mov"],
  [["audio", "audios", "musica"], ".mp3,.wav,.ogg"],
];

function detectFileExtension(normalized: string): string | undefined {
  for (const [keywords, extensions] of FILE_EXTENSION_MAP) {
    for (const kw of keywords) {
      if (normalized.includes(kw)) return extensions;
    }
  }
  return undefined;
}

const LLM_PHRASES = [
  "que entra en",
  "que cae en",
  "como estudio",
  "como preparo",
  "consejos para",
  "como me preparo",
  "que temas",
  "que estudiar",
];

// Order matters: more specific patterns first
const PATTERNS: PatternDef[] = [
  // LINK / UNLINK
  {
    type: "unlink_account",
    keywords: ["desvincular", "desconectar", "desenlazar"],
  },
  {
    type: "link_account",
    keywords: [
      "vincular", "conectar cuenta", "enlazar", "registrar cuenta",
      "configurar cuenta", "mi token", "empezar", "activar cuenta", "setup",
    ],
  },
  // STATUS
  {
    type: "status",
    keywords: [
      "mi cuenta", "estoy vinculado", "mi perfil", "mi nombre",
      "quien soy", "estado cuenta",
    ],
  },
  // HELP
  {
    type: "help",
    keywords: [
      "ayuda", "help", "/ayuda", "/help", "/start",
      "que puedes hacer", "que haces", "como funciona",
      "como te uso", "que sabes hacer", "para que sirves", "comandos",
      "opciones", "funciones", "tutorial", "instrucciones", "manual",
    ],
  },
  // FILES — before assignments because "material" could overlap
  {
    type: "files",
    keywords: [
      "archivo", "archivos", "documento", "documentos", "pdf", "pdfs",
      "material", "materiales", "recurso", "recursos", "diapositiva",
      "diapositivas", "presentacion", "presentaciones", "slides", "ppt",
      "guia", "guias", "apuntes", "apunte", "temario", "syllabus",
      "programa", "descarga", "descargar", "bajar", "subido", "subidos",
      "fichero", "ficheros", "/archivos",
      "mandame", "enviame", "dame", "pasame", "manda", "envia",
    ],
    build: (n) => ({ type: "files" as const, fileExtension: detectFileExtension(n) }),
  },
  // ANNOUNCEMENTS
  {
    type: "announcements",
    keywords: [
      "anuncio", "anuncios", "aviso", "avisos", "noticia", "noticias",
      "novedad", "novedades", "comunicado", "comunicados",
      "nuevo", "nueva", "nuevos",
      "publicado", "publicacion",
      "que hay de nuevo", "hay algo nuevo", "alguna novedad",
      "algun aviso", "han dicho algo", "ha dicho algo",
      "/anuncios",
    ],
  },
  // ASSIGNMENTS
  {
    type: "assignments",
    keywords: [
      "tarea", "tareas", "pendiente", "pendientes", "entrega", "entregas",
      "deberes", "deber", "actividad", "actividades", "trabajo", "trabajos",
      "ejercicio", "ejercicios", "practica", "practicas", "proyecto", "proyectos",
      "que tengo que hacer", "que hay que hacer", "que me falta", "que debo",
      "que debo entregar", "para cuando", "fecha limite", "deadline",
      "que hay pendiente", "algo pendiente", "tengo algo",
      "/tareas",
    ],
    build: (n) => ({ type: "assignments", onlyPending: hasUrgency(n) }),
  },
  // GRADES
  {
    type: "grades",
    keywords: [
      "nota", "notas", "calificacion", "calificaciones", "grade",
      "grades", "puntuacion", "puntaje", "resultado", "resultados",
      "como voy", "como estoy", "cuanto tengo", "cuanto saque",
      "que saque", "mi nota", "mis notas", "mi calificacion",
      "aprobado", "suspendido", "suspenso", "aprobar", "he aprobado",
      "voy bien", "voy mal", "media", "promedio", "nota media",
      "nota final", "parcial", "examen", "/notas",
    ],
  },
  // CALENDAR
  {
    type: "calendar",
    keywords: [
      "calendario", "horario", "agenda", "evento", "eventos",
      "programado", "programada", "planificado",
      "semanal", "hoy", "mañana",
      "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo",
      "proxima semana", "esta semana", "/calendario",
    ],
    build: (n) => ({ type: "calendar", days: detectDays(n) }),
  },
  // COURSES
  {
    type: "courses",
    keywords: [
      "cursos", "materias", "asignaturas", "clases",
      "que estudio", "que curso", "en que estoy",
      "mis cursos", "mis materias", "mis asignaturas", "mis clases",
      "que materias", "que asignaturas", "cuantas materias", "cuantos cursos",
      "lista de cursos", "lista de materias",
      "estoy inscrito", "estoy matriculado", "matricula",
      "/cursos",
    ],
  },
  // GREETING — last so that "hola + otra intención" gets caught first
  {
    type: "greeting",
    keywords: [
      "hola", "buenas", "buenos dias", "buenas tardes", "buenas noches",
      "hey", "ey", "que tal", "como estas", "saludos", "wenas", "buenass",
      "holaa", "holaaa", "hi", "hello",
    ],
  },
];

// --- Matching functions ---

function phraseMatchesExact(normalized: string, phrase: string): boolean {
  const words = phrase.split(" ");
  if (words.length === 1) {
    const re = new RegExp(`(?:^|\\s)${words[0]}(?:\\s|$)`);
    return re.test(normalized);
  }
  return words.every((w) => normalized.includes(w));
}

/**
 * Fuzzy single-word match: checks if any word in the message is
 * within Levenshtein distance <= 1 of the keyword (for words >= 4 chars).
 */
function phraseMatchesFuzzy(normalizedWords: string[], phrase: string): boolean {
  const phraseWords = phrase.split(" ");
  // Only fuzzy-match single-word keywords with length >= 4
  if (phraseWords.length !== 1 || phraseWords[0].length < 4) return false;

  const keyword = phraseWords[0];
  return normalizedWords.some(
    (w) => w.length >= 4 && levenshtein(w, keyword) <= 1 && w !== keyword
  );
}

// --- Compound intent detection ---

const COMPOUND_CONJUNCTIONS = [" y ", " e "];

function splitCompoundMessage(normalized: string): string[] | null {
  for (const conj of COMPOUND_CONJUNCTIONS) {
    const idx = normalized.indexOf(conj);
    if (idx === -1) continue;

    const left = normalized.slice(0, idx).trim();
    const right = normalized.slice(idx + conj.length).trim();
    if (left.length > 0 && right.length > 0) {
      return [left, right];
    }
  }
  return null;
}

// --- Public API ---

/**
 * Classic single-intent classifier (backwards compatible).
 */
export function classifyIntent(normalized: string): Intent {
  if (LLM_PHRASES.some((phrase) => normalized.includes(phrase))) {
    return { type: "unknown" };
  }

  const hasGreeting = PATTERNS.find((p) => p.type === "greeting")!
    .keywords.some((kw) => phraseMatchesExact(normalized, kw));

  const normalizedWords = normalized.split(" ").filter((w) => w.length > 0);

  for (const pattern of PATTERNS) {
    if (pattern.type === "greeting" && hasGreeting) continue;

    for (const kw of pattern.keywords) {
      if (phraseMatchesExact(normalized, kw)) {
        if (pattern.build) return pattern.build(normalized);
        return { type: pattern.type } as Intent;
      }
    }

    // Fuzzy matching pass (Phase 3)
    for (const kw of pattern.keywords) {
      if (phraseMatchesFuzzy(normalizedWords, kw)) {
        if (pattern.build) return pattern.build(normalized);
        return { type: pattern.type } as Intent;
      }
    }
  }

  if (hasGreeting) return { type: "greeting" };
  return { type: "unknown" };
}

/**
 * Enhanced classifier that supports compound intents (Phase 3).
 * Returns multiple intents for messages like "tareas y notas de física".
 */
export function classifyMessage(normalized: string): ClassifyResult {
  // Try compound detection first
  const parts = splitCompoundMessage(normalized);
  if (parts) {
    const intents: Intent[] = [];
    let courseName: string | undefined;

    for (const part of parts) {
      const intent = classifyIntent(part);
      if (intent.type !== "unknown") {
        intents.push(intent);
        // Extract course name from any part
        if ("courseName" in intent && intent.courseName) {
          courseName = intent.courseName;
        }
      }
    }

    // If the second part didn't have a course but the first did (or vice versa),
    // share the course name
    if (courseName && intents.length > 1) {
      for (const intent of intents) {
        if ("courseName" in intent && !intent.courseName) {
          (intent as { courseName?: string }).courseName = courseName;
        }
      }
    }

    if (intents.length > 0) {
      return { intents, courseName };
    }
  }

  // Single intent
  const intent = classifyIntent(normalized);
  return {
    intents: [intent],
    courseName: "courseName" in intent ? (intent as { courseName?: string }).courseName : undefined,
  };
}
