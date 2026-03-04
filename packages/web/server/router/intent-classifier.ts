export type Intent =
  | { type: "courses" }
  | { type: "assignments"; courseName?: string; onlyPending?: boolean }
  | { type: "grades"; courseName?: string }
  | { type: "calendar"; days?: number }
  | { type: "announcements"; courseName?: string }
  | { type: "files"; courseName?: string; fileExtension?: string }
  | { type: "help" }
  | { type: "greeting" }
  | { type: "link_account" }
  | { type: "unlink_account" }
  | { type: "status" }
  | { type: "unknown" };

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

// Phrases that look like they might match an intent keyword but actually mean
// something Canvas can't answer — should go to LLM (Tier 3)
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
  "que entra en",     // "qué entra en el examen" → exam content, not grades
  "que cae en",       // "qué cae en el examen"
  "como estudio",     // study tips
  "como preparo",     // study tips
  "consejos para",    // advice
  "como me preparo",
  "que temas",        // "qué temas entran"
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
      // Action verbs: "mandame el examen" → FILES (not GRADES)
      "mandame", "enviame", "dame", "pasame", "manda", "envia",
    ],
    build: (n) => ({ type: "files" as const, fileExtension: detectFileExtension(n) }),
  },
  // ANNOUNCEMENTS — before assignments because "hay algo nuevo" must not match "hay algo"
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

function phraseMatches(normalized: string, phrase: string): boolean {
  const words = phrase.split(" ");
  if (words.length === 1) {
    // Single word: check word boundary
    const re = new RegExp(`(?:^|\\s)${words[0]}(?:\\s|$)`);
    return re.test(normalized);
  }
  // Multi-word phrase: all words must appear
  return words.every((w) => normalized.includes(w));
}

export function classifyIntent(normalized: string): Intent {
  // If the message matches an LLM-only phrase, skip pattern matching entirely
  if (LLM_PHRASES.some((phrase) => normalized.includes(phrase))) {
    return { type: "unknown" };
  }

  // Check if there's a greeting + another intent
  const hasGreeting = PATTERNS.find((p) => p.type === "greeting")!
    .keywords.some((kw) => phraseMatches(normalized, kw));

  for (const pattern of PATTERNS) {
    // Skip greeting on first pass if mixed with other content
    if (pattern.type === "greeting" && hasGreeting) continue;

    for (const kw of pattern.keywords) {
      if (phraseMatches(normalized, kw)) {
        if (pattern.build) return pattern.build(normalized);
        return { type: pattern.type } as Intent;
      }
    }
  }

  // If only greeting matched
  if (hasGreeting) return { type: "greeting" };

  return { type: "unknown" };
}
