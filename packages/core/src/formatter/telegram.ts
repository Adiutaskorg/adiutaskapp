import { createFormatter, type FormatterAdapter } from "./base";

const telegramAdapter: FormatterAdapter = {
  bold: (text) => `*${text}*`,
  italic: (text) => `_${text}_`,
  link: (text, url) => `[${text}](${url})`,
};

const fmt = createFormatter(telegramAdapter);

// Re-export all formatter functions bound to Telegram MarkdownV2 style
export const formatCourses = fmt.formatCourses;
export const formatAssignments = fmt.formatAssignments;
export const formatGrades = fmt.formatGrades;
export const formatEvents = fmt.formatEvents;
export const formatAnnouncements = fmt.formatAnnouncements;
export const formatFileMatch = fmt.formatFileMatch;
export const formatFiles = fmt.formatFiles;
export const formatFolderContents = fmt.formatFolderContents;

export function formatHelp(): string {
  return fmt.formatHelp("/vincular", "/desvincular", "/ayuda");
}

export function formatGreeting(): string {
  return fmt.formatGreeting('Escribe /ayuda para ver todo lo que puedo hacer');
}

export const formatCoursePrompt = fmt.formatCoursePrompt;
export const formatMultipleCourses = fmt.formatMultipleCourses;
export const formatNoCourseFound = fmt.formatNoCourseFound;
