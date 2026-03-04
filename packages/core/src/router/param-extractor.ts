import type { Course, CourseFile } from "../types/canvas";
import { normalize, levenshtein } from "./normalizer";

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
  for (const prep of COURSE_PREPS) {
    const patterns = [` ${prep} `];
    for (const pat of patterns) {
      const idx = normalized.indexOf(pat);
      if (idx === -1) continue;

      let candidate = normalized.slice(idx + pat.length).trim();
      // Remove temporal suffixes
      for (const suffix of TEMPORAL_SUFFIXES) {
        if (candidate.endsWith(suffix)) {
          candidate = candidate.slice(0, -suffix.length).trim();
          break;
        }
      }
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
    if (scored[0].score > scored[1].score) return { type: "single", course: scored[0].course };
    const topScore = scored[0].score;
    const tied = scored.filter((s) => s.score === topScore).map((s) => s.course);
    return { type: "multiple", courses: tied };
  }

  // 5. Levenshtein fuzzy scoring (Phase 5): compare each query word against course name words
  const fuzzyScored = courses
    .map((c) => {
      const cWords = normalize(c.name).split(" ").filter((w) => w.length > 0);
      let score = 0;
      for (const qw of qWords) {
        if (qw.length < 3) continue;
        for (const cw of cWords) {
          if (cw.length < 3) continue;
          const dist = levenshtein(qw, cw);
          if (dist === 0) {
            score += 3; // exact word match
          } else if (dist <= 1) {
            score += 2; // close match
          } else if (dist <= 2 && qw.length >= 5) {
            score += 1; // loose match for longer words
          }
        }
      }
      return { course: c, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (fuzzyScored.length === 1) return { type: "single", course: fuzzyScored[0].course };
  if (fuzzyScored.length > 1) {
    if (fuzzyScored[0].score > fuzzyScored[1].score) return { type: "single", course: fuzzyScored[0].course };
    const topScore = fuzzyScored[0].score;
    const tied = fuzzyScored.filter((s) => s.score === topScore).map((s) => s.course);
    return { type: "multiple", courses: tied };
  }

  // 6. Match by course code
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
  "mandame", "enviame", "dame", "pasame", "manda", "envia",
  "descarga", "descargar", "bajar",
  "archivo", "archivos", "documento", "documentos", "pdf", "pdfs",
  "material", "materiales", "recurso", "recursos", "diapositiva",
  "diapositivas", "presentacion", "presentaciones", "slides", "ppt",
  "guia", "guias", "apuntes", "apunte", "temario", "syllabus",
  "programa", "fichero", "ficheros", "subido", "subidos",
]);

function normalizeFileName(name: string): string {
  const noExt = name.replace(/\.[^.]+$/, "");
  const spaced = noExt.replace(/[_\-.]+/g, " ");
  return normalize(spaced);
}

export function extractFileQuery(normalized: string, courseName: string | null): string {
  let words = normalized.split(" ").filter((w) => w.length > 0);
  words = words.filter((w) => !FILE_TRIGGER_WORDS.has(w));
  words = words.filter((w) => !FILE_NOISE_WORDS.has(w));
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
      const fWords = fNorm.split(" ").filter((w) => w.length > 0);
      let score = 0;

      for (const qw of qWords) {
        // Exact substring match
        if (fNorm.includes(qw)) {
          score += 2;
          continue;
        }
        // Levenshtein fuzzy match against file name words
        if (qw.length >= 3) {
          for (const fw of fWords) {
            if (fw.length >= 3 && levenshtein(qw, fw) <= 1) {
              score += 1;
              break;
            }
          }
        }
      }

      return { file: f, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { type: "none" };

  const topScore = scored[0].score;
  // Lowered threshold from 2 to 1 (Phase 5)
  if (topScore < 1) return { type: "none" };

  const tied = scored.filter((s) => s.score === topScore);
  if (tied.length === 1) return { type: "single", file: tied[0].file };
  return { type: "multiple", files: tied.map((s) => s.file) };
}
