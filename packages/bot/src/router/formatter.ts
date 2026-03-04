import type { Course, Assignment, Grades, CalendarEvent, Announcement, CourseFile, CourseFolder } from "../canvas/types";

const TZ = "Europe/Madrid";
const MAX_ITEMS = 10;

function formatDateShort(iso: string | null): string {
  if (!iso) return "sin fecha";
  const d = new Date(iso);
  const day = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
  return day;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "sin fecha";
  const d = new Date(iso);
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
  return time;
}

function formatDateGroupKey(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const todayStr = now.toLocaleDateString("es-ES", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });
  const dateStr = d.toLocaleDateString("es-ES", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString("es-ES", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });

  if (dateStr === todayStr) {
    return `*Hoy, ${d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short", timeZone: TZ })}*`;
  }
  if (dateStr === tomorrowStr) {
    return `*Mañana, ${d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short", timeZone: TZ })}*`;
  }
  return `*${capitalize(d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short", timeZone: TZ }))}*`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} minuto${minutes === 1 ? "" : "s"}`;
  if (hours < 24) return `hace ${hours} hora${hours === 1 ? "" : "s"}`;
  if (days < 7) return `hace ${days} día${days === 1 ? "" : "s"}`;
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileIcon(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "pdf": return "📕";
    case "doc": case "docx": return "📝";
    case "ppt": case "pptx": return "📊";
    case "xls": case "xlsx": return "📗";
    case "zip": case "rar": return "🗜";
    case "jpg": case "jpeg": case "png": case "gif": case "svg": case "webp": return "🖼";
    case "mp4": case "avi": case "mov": case "mkv": return "🎬";
    case "mp3": case "wav": case "ogg": case "flac": return "🎵";
    default: return "📄";
  }
}

export function formatCourses(courses: Course[]): string {
  if (courses.length === 0) return "No tienes cursos activos 🤷";
  const sorted = [...courses].sort((a, b) => a.name.localeCompare(b.name));
  const lines = sorted.map((c, i) => `${i + 1}. ${c.name}`);
  return `📚 *Tus cursos activos (${courses.length})*\n\n${lines.join("\n")}\n\n💡 Escribe "tareas de [nombre]" o "notas de [nombre]" para más detalles`;
}

// Assignments grouped by course
export interface AssignmentWithCourse extends Assignment {
  _courseName?: string;
}

export function formatAssignments(assignments: AssignmentWithCourse[], courseName?: string): string {
  if (assignments.length === 0) {
    return "🎉 *¡No tienes tareas pendientes!*\nDisfruta el momento (o adelanta algo 😉)";
  }

  // Sort by due date
  const sorted = [...assignments].sort((a, b) => {
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  });

  if (courseName) {
    // Single course view
    const lines = sorted.slice(0, MAX_ITEMS).map((a) => {
      const pts = a.points_possible ? ` — ${a.points_possible} pts` : "";
      return `  • ${a.name} — 📅 ${formatDateShort(a.due_at)}${pts}`;
    });
    const more = sorted.length > MAX_ITEMS ? `\n\n... y ${sorted.length - MAX_ITEMS} más` : "";
    return `📝 *Tareas pendientes de ${courseName}*\n\n${lines.join("\n")}${more}`;
  }

  // Multi-course: group by course
  const byCourse = new Map<string, AssignmentWithCourse[]>();
  for (const a of sorted) {
    const cn = a._courseName ?? "Sin curso";
    if (!byCourse.has(cn)) byCourse.set(cn, []);
    byCourse.get(cn)!.push(a);
  }

  const sections: string[] = [];
  let total = 0;
  for (const [cn, items] of byCourse) {
    const lines = items.slice(0, 5).map((a) => {
      const pts = a.points_possible ? ` — ${a.points_possible} pts` : "";
      return `  • ${a.name} — 📅 ${formatDateShort(a.due_at)}${pts}`;
    });
    const more = items.length > 5 ? `\n  ... y ${items.length - 5} más` : "";
    sections.push(`📚 *${cn}*\n${lines.join("\n")}${more}`);
    total += items.length;
  }

  return `📝 *Tareas pendientes*\n\n${sections.join("\n\n")}\n\n✅ Total: ${total} tarea${total === 1 ? "" : "s"} pendiente${total === 1 ? "" : "s"}\n\n💡 Escribe "tareas de [curso]" para ver solo las de ese curso`;
}

export function formatGrades(grades: Grades[]): string {
  if (grades.length === 0) return "No hay calificaciones disponibles 📊";

  const lines = grades.map((g) => {
    const name = g.course_name || "Curso";
    if (g.current_score !== null) {
      const grade = g.current_grade ? ` (${g.current_grade})` : "";
      return `📚 *${name}*\n  Nota actual: *${g.current_score}*${grade}`;
    }
    return `📚 *${name}*\n  Nota actual: *Sin calificar aún*`;
  });

  // Calculate average of courses that have scores
  const withScores = grades.filter((g) => g.current_score !== null);
  let avgLine = "";
  if (withScores.length > 0) {
    const avg = withScores.reduce((sum, g) => sum + g.current_score!, 0) / withScores.length;
    avgLine = `\n\n📈 Media general: *${avg.toFixed(2)}*`;
  }

  return `📊 *Tus calificaciones*\n\n${lines.join("\n\n")}${avgLine}`;
}

export function formatEvents(events: CalendarEvent[]): string {
  if (events.length === 0) return "📅 *No hay eventos próximos*\nTu semana viene tranquila 😎";

  // Group by date
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = e.start_at ? formatDateGroupKey(e.start_at) : "*Sin fecha*";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const sections: string[] = [];
  let total = 0;
  for (const [dateLabel, items] of groups) {
    const lines = items.map((e) => {
      const time = e.start_at ? formatDateTime(e.start_at) : "";
      const course = e.course_name ? ` — ${e.course_name}` : "";
      return `  📌 ${time} — ${e.title}${course}`;
    });
    sections.push(`${dateLabel}\n${lines.join("\n")}`);
    total += items.length;
  }

  return `📅 *Próximos eventos*\n\n${sections.join("\n\n")}\n\n📆 Total: ${total} evento${total === 1 ? "" : "s"}`;
}

export function formatAnnouncements(announcements: Announcement[], courseName?: string): string {
  if (announcements.length === 0) return "📢 No hay anuncios recientes";

  const header = courseName ? `📢 *Anuncios de ${courseName}*` : "📢 *Anuncios recientes*";

  const lines = announcements.slice(0, MAX_ITEMS).map((a) => {
    const courseLabel = a.course_name ? `📚 *${a.course_name}*` : "📚 *Curso*";
    const time = a.posted_at ? ` — ${relativeTime(a.posted_at)}` : "";
    const excerpt = stripHtml(a.message).slice(0, 150);
    const ellipsis = stripHtml(a.message).length > 150 ? "..." : "";
    return `${courseLabel}${time}\n*${a.title}*\n${excerpt}${ellipsis}`;
  });

  const more = announcements.length > MAX_ITEMS
    ? `\n\n... y ${announcements.length - MAX_ITEMS} más`
    : "";

  return `${header}\n\n${lines.join("\n\n")}${more}\n\n💡 Para ver anuncios de un curso: "anuncios de [curso]"`;
}

export function formatFileMatch(file: CourseFile, courseName: string): string {
  return `📄 Encontré *${file.display_name}* en *${courseName}* (${formatSize(file.size)})`;
}

export function formatFiles(files: CourseFile[], courseName?: string, page = 1, totalPages = 1): string {
  if (files.length === 0) return "📁 No hay archivos en este curso";
  const header = courseName ? `📁 *Archivos de ${courseName}*` : "📁 *Archivos del curso*";
  const pageInfo = totalPages > 1 ? ` (Página ${page} de ${totalPages})` : "";
  const lines = files.map(
    (f) => `  ${fileIcon(f.display_name)} *${f.display_name}*\n    ${formatSize(f.size)} — ${relativeTime(f.updated_at)}`
  );
  return `${header}${pageInfo}\n\n${lines.join("\n\n")}`;
}

export function formatFolderContents(
  folders: CourseFolder[],
  files: CourseFile[],
  folderName: string,
  page = 1,
  totalPages = 1,
): string {
  const pageInfo = totalPages > 1 ? ` (Página ${page} de ${totalPages})` : "";
  const header = `📂 *${folderName}*${pageInfo}`;
  const parts: string[] = [header];

  if (folders.length > 0) {
    const folderLines = folders.map(
      (f) => `  📁 *${f.name}* — ${f.files_count} archivo${f.files_count === 1 ? "" : "s"}`
    );
    parts.push(folderLines.join("\n"));
  }

  if (files.length > 0) {
    const fileLines = files.map(
      (f) => `  ${fileIcon(f.display_name)} *${f.display_name}*\n    ${formatSize(f.size)} — ${relativeTime(f.updated_at)}`
    );
    parts.push(fileLines.join("\n\n"));
  }

  if (folders.length === 0 && files.length === 0) {
    parts.push("Esta carpeta está vacía");
  }

  return parts.join("\n\n");
}

export function formatHelp(): string {
  return `👋 *¡Hola! Soy UniBot*
Tu asistente para Canvas UFV

Esto es lo que puedo hacer:

📚 *Cursos* — "mis cursos", "qué estudio"
📝 *Tareas* — "tareas pendientes", "tareas de física"
📊 *Notas* — "mis notas", "notas de informática"
📅 *Calendario* — "qué hay mañana", "horario de la semana"
📢 *Anuncios* — "hay algo nuevo", "anuncios de mecánica"
📁 *Archivos* — "material de gráfica", "pdfs de informática"

🔗 /vincular — Conectar tu cuenta de Canvas
❌ /desvincular — Desconectar tu cuenta
ℹ️ /ayuda — Ver este mensaje

💡 Puedes escribir de forma natural:
  "qué tengo que entregar esta semana"
  "cómo voy en electromagnética"
  "hay apuntes nuevos de informática"`;
}

export function formatGreeting(): string {
  return `👋 *¡Hola! ¿Qué necesitas?*

Algunas ideas:
📝 "tareas pendientes"
📊 "mis notas"
📅 "qué hay mañana"

Escribe /ayuda para ver todo lo que puedo hacer`;
}

export function formatCoursePrompt(courses: Course[]): string {
  const list = courses.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
  return `¿De qué curso necesitas los archivos?\n\n${list}\n\n💡 Escribe: "archivos de [nombre del curso]"`;
}

export function formatMultipleCourses(courses: Course[], query: string): string {
  const list = courses.map((c) => `📚 *${c.name}*`).join("\n");
  return `Encontré varios cursos con "${query}":\n\n${list}\n\n¿Cuál te interesa? Sé más específico.`;
}

export function formatNoCourseFound(query: string, courses: Course[]): string {
  const list = courses.slice(0, 8).map((c) => `  • ${c.name}`).join("\n");
  return `No encontré ningún curso llamado "${query}". Tus cursos son:\n\n${list}`;
}
