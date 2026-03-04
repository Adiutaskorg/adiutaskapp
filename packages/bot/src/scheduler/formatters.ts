import type { Assignment, Announcement } from "../canvas/types";

export function formatAssignmentReminder(
  assignment: Assignment,
  courseName: string,
  hoursLeft: number
): string {
  const urgency = hoursLeft <= 2 ? "🔴" : "🟡";
  const timeLabel =
    hoursLeft <= 1
      ? "menos de 1 hora"
      : hoursLeft <= 2
        ? "~2 horas"
        : `~${Math.round(hoursLeft)} horas`;

  const points = assignment.points_possible
    ? ` (${assignment.points_possible} pts)`
    : "";

  return (
    `${urgency} *Entrega próxima*\n\n` +
    `📝 *${assignment.name}*${points}\n` +
    `📚 ${courseName}\n` +
    `⏰ Quedan ${timeLabel}`
  );
}

export function formatNewAnnouncement(
  announcement: Announcement,
  courseName: string
): string {
  // Strip HTML tags from message and truncate
  const cleanMsg = announcement.message
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
  const preview = cleanMsg.length > 300 ? cleanMsg.slice(0, 300) + "..." : cleanMsg;

  return (
    `📢 *Nuevo anuncio*\n\n` +
    `*${announcement.title}*\n` +
    `📚 ${courseName}\n\n` +
    `${preview}`
  );
}

export function formatGradeUpdate(
  courseName: string,
  score: number | null,
  grade: string | null
): string {
  const scoreText = score !== null ? `${score}%` : "N/A";
  const gradeText = grade ? ` (${grade})` : "";

  return (
    `📊 *Nota actualizada*\n\n` +
    `📚 ${courseName}\n` +
    `📈 Nota actual: *${scoreText}*${gradeText}`
  );
}
