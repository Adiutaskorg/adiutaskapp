const ACCENT_MAP: Record<string, string> = {
  "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u",
};

const ABBREVIATIONS: Record<string, string> = {
  "q": "que",
  "k": "que",
  "xq": "porque",
  "pq": "porque",
  "tmb": "también",
  "tb": "también",
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
};

export function normalize(text: string): string {
  let result = text.toLowerCase();
  // Remove ? ! .
  result = result.replace(/[¿?¡!.]/g, "");
  // Replace accented chars (keep ñ)
  result = result.replace(/[áéíóúü]/g, (ch) => ACCENT_MAP[ch] ?? ch);
  // Collapse whitespace
  result = result.replace(/\s+/g, " ").trim();
  return result;
}

export function expandAbbreviations(text: string): string {
  const words = text.split(" ");
  return words.map((w) => ABBREVIATIONS[w] ?? w).join(" ");
}
