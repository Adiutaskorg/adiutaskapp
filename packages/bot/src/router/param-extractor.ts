import type { Course, CourseFile } from "../canvas/types";
import { normalize } from "./normalizer";

const NOISE_WORDS = new Set([
  "la", "el", "los", "las", "mi", "mis", "del", "un", "una", "unos", "unas",
  "clase", "materia", "curso", "asignatura",
]);

// Temporal markers that should be stripped from course names
const TEMPORAL_SUFFIXES = [
  "de mañana", "de hoy", "de esta semana", "de manana",
  "del lunes", "del martes", "del miercoles", "del jueves", "del viernes",
  "del sabado", "del domingo",
  "para mañana", "para hoy", "para manana",
  "esta semana", "proxima semana", "siguiente semana",
];

// Prepositions that introduce a course name
const COURSE_PREPS = ["de", "en", "para"];

export function extractCourseName(normalized: string): string | null {
  // Try each preposition
  for (const prep of COURSE_PREPS) {
    // Find the last occurrence of " prep " to handle "fundamentos de ingeniería"
    const patterns = [` ${prep} `];
    for (const pat of patterns) {
      const idx = normalized.indexOf(pat);
      if (idx === -1) continue;

      let candidate = normalized.slice(idx + pat.length).trim();
      // Remove temporal suffixes (e.g. "matematicas de mañana" → "matematicas")
      for (const suffix of TEMPORAL_SUFFIXES) {
        if (candidate.endsWith(suffix)) {
          candidate = candidate.slice(0, -suffix.length).trim();
          break;
        }
      }
      // Remove trailing noise
      candidate = candidate.replace(/\s+$/, "");
      if (candidate.length === 0) continue;

      // Clean noise words only if they're at the start
      const words = candidate.split(" ");
      const cleaned: string[] = [];
      let startedContent = false;
      for (const w of words) {
        if (!startedContent && NOISE_WORDS.has(w)) continue;
        startedContent = true;
        cleaned.push(w);
      }

      const result = cleaned.join(" ").trim();
      if (result.length > 0) return result;
    }
  }

  return null;
}

export type CourseMatch =
  | { type: "single"; course: Course }
  | { type: "multiple"; courses: Course[] }
  | { type: "none" };

export function findBestCourseMatch(courses: Course[], query: string): CourseMatch {
  const q = normalize(query);
  const qWords = q.split(" ").filter((w) => w.length > 0);

  // 1. Exact match (normalized)
  const exact = courses.find((c) => normalize(c.name) === q);
  if (exact) return { type: "single", course: exact };

  // 2. Query is substring of course name
  const substringMatches = courses.filter((c) => normalize(c.name).includes(q));
  if (substringMatches.length === 1) return { type: "single", course: substringMatches[0] };
  if (substringMatches.length > 1) return { type: "multiple", courses: substringMatches };

  // 3. All words of query appear in course name
  const allWordsMatches = courses.filter((c) => {
    const cNorm = normalize(c.name);
    return qWords.every((w) => cNorm.includes(w));
  });
  if (allWordsMatches.length === 1) return { type: "single", course: allWordsMatches[0] };
  if (allWordsMatches.length > 1) return { type: "multiple", courses: allWordsMatches };

  // 4. Scoring: each query word that appears in course name scores 1 point
  const scored = courses
    .map((c) => {
      const cNorm = normalize(c.name);
      const score = qWords.filter((w) => cNorm.includes(w)).length;
      return { course: c, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1) return { type: "single", course: scored[0].course };
  if (scored.length > 1) {
    // If top score is unique, take it
    if (scored[0].score > scored[1].score) return { type: "single", course: scored[0].course };
    // Multiple with same score
    const topScore = scored[0].score;
    const tied = scored.filter((s) => s.score === topScore).map((s) => s.course);
    return { type: "multiple", courses: tied };
  }

  // 5. Match by course code
  const codeMatches = courses.filter((c) =>
    normalize(c.course_code).includes(q)
  );
  if (codeMatches.length === 1) return { type: "single", course: codeMatches[0] };
  if (codeMatches.length > 1) return { type: "multiple", courses: codeMatches };

  return { type: "none" };
}

// --- File fuzzy matching ---

const FILE_NOISE_WORDS = new Set([
  "de", "del", "el", "la", "los", "las", "un", "una", "unos", "unas",
  "me", "mi", "mis", "en", "y", "o", "a", "al", "por", "con", "que",
]);

const FILE_TRIGGER_WORDS = new Set([
  // Action verbs
  "mandame", "enviame", "dame", "pasame", "manda", "envia",
  "descarga", "descargar", "bajar",
  // Intent keywords
  "archivo", "archivos", "documento", "documentos", "pdf", "pdfs",
  "material", "materiales", "recurso", "recursos", "diapositiva",
  "diapositivas", "presentacion", "presentaciones", "slides", "ppt",
  "guia", "guias", "apuntes", "apunte", "temario", "syllabus",
  "programa", "fichero", "ficheros", "subido", "subidos",
]);

function normalizeFileName(name: string): string {
  // Remove extension
  const noExt = name.replace(/\.[^.]+$/, "");
  // Replace underscores, dashes, dots with spaces
  const spaced = noExt.replace(/[_\-.]+/g, " ");
  return normalize(spaced);
}

export function extractFileQuery(normalized: string, courseName: string | null): string {
  let words = normalized.split(" ").filter((w) => w.length > 0);
  // Remove trigger words
  words = words.filter((w) => !FILE_TRIGGER_WORDS.has(w));
  // Remove noise words
  words = words.filter((w) => !FILE_NOISE_WORDS.has(w));
  // Remove course name words
  if (courseName) {
    const courseWords = new Set(normalize(courseName).split(" ").filter((w) => w.length > 0));
    words = words.filter((w) => !courseWords.has(w));
  }
  return words.join(" ").trim();
}

export type FileMatch =
  | { type: "single"; file: CourseFile }
  | { type: "multiple"; files: CourseFile[] }
  | { type: "none" };

export function findBestFileMatch(files: CourseFile[], query: string): FileMatch {
  const qWords = normalize(query).split(" ").filter((w) => w.length > 0);
  if (qWords.length === 0) return { type: "none" };

  const scored = files
    .map((f) => {
      const fNorm = normalizeFileName(f.display_name);
      const score = qWords.filter((w) => fNorm.includes(w)).length;
      return { file: f, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { type: "none" };

  const topScore = scored[0].score;
  if (topScore < 2) return { type: "none" };

  const tied = scored.filter((s) => s.score === topScore);
  if (tied.length === 1) return { type: "single", file: tied[0].file };
  return { type: "multiple", files: tied.map((s) => s.file) };
}
