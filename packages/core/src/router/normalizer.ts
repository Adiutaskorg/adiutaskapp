// --- Levenshtein distance (no dependencies) ---

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

// --- Accent map ---

const ACCENT_MAP: Record<string, string> = {
  "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u",
};

// --- Abbreviations (extended) ---

const ABBREVIATIONS: Record<string, string> = {
  "q": "que",
  "k": "que",
  "xq": "porque",
  "pq": "porque",
  "tmb": "también",
  "tb": "también",
  "tbn": "también",
  "dnd": "donde",
  "cdo": "cuando",
  "cnd": "cuando",
  "pf": "por favor",
  "plz": "por favor",
  "pls": "por favor",
  "info": "información",
  "profe": "profesor",
  "mates": "matemáticas",
  "fisi": "física",
  "progra": "programación",
  "lab": "laboratorio",
  "biblio": "biblioteca",
  "cuatri": "cuatrimestre",
  "dpto": "departamento",
  "uni": "universidad",
  "asig": "asignatura",
  "calif": "calificación",
  // New abbreviations (Phase 2)
  "dsp": "después",
  "xa": "para",
  "pa": "para",
  "mñn": "mañana",
  "exam": "examen",
  "prox": "próxima",
  "entga": "entrega",
  "desp": "después",
  "nec": "necesito",
  "fav": "favor",
  "prof": "profesor",
  "ing": "ingeniería",
  "mate": "matemáticas",
  "bio": "biología",
  "quim": "química",
  "hist": "historia",
  "fil": "filosofía",
  "econ": "economía",
  "dcho": "derecho",
  "psico": "psicología",
};

// Emoji regex: covers most common emoji ranges
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

export function normalize(text: string): string {
  let result = text.toLowerCase();
  // Remove emojis and special characters
  result = result.replace(EMOJI_REGEX, " ");
  // Remove ? ! . , ; : and inverted forms
  result = result.replace(/[¿?¡!.,;:()[\]{}""''«»—–]/g, "");
  // Replace accented chars (keep ñ)
  result = result.replace(/[áéíóúü]/g, (ch) => ACCENT_MAP[ch] ?? ch);
  // Collapse whitespace
  result = result.replace(/\s+/g, " ").trim();
  return result;
}

export function expandAbbreviations(text: string): string {
  const words = text.split(" ");
  return words
    .map((w) => {
      // Exact match first
      if (ABBREVIATIONS[w]) return ABBREVIATIONS[w];
      // Fuzzy match for words >= 3 chars with levenshtein <= 1
      if (w.length >= 3) {
        for (const [abbr, expansion] of Object.entries(ABBREVIATIONS)) {
          if (abbr.length >= 3 && levenshtein(w, abbr) <= 1) {
            return expansion;
          }
        }
      }
      return w;
    })
    .join(" ");
}
