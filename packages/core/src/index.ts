// Types
export type { UserProfile, Course, Assignment, Grades, CalendarEvent, Announcement, CourseFile, CourseFolder } from "./types/canvas";
export type { ConversationMessage } from "./types/conversation";
export type { Intent, ClassifyResult } from "./types/intent";

// Router
export { normalize, expandAbbreviations, levenshtein } from "./router/normalizer";
export { classifyIntent, classifyMessage } from "./router/intent-classifier";
export { resolveContext, setLastCourse, getLastCourse, clearLastCourse } from "./router/context-resolver";
export { extractCourseName, findBestCourseMatch, extractFileQuery, findBestFileMatch } from "./router/param-extractor";
export type { CourseMatch, FileMatch } from "./router/param-extractor";
export { routeCommand } from "./router/commands";
export type { CommandResult, CommandFormatter } from "./router/commands";

// Canvas
export { CanvasClient, TokenExpiredError, CanvasAPIError } from "./canvas/client";

// AI
export { buildSystemPrompt } from "./ai/system-prompt";
export { ClaudeProvider, createLLMProvider } from "./ai/llm";
export type { LLMProvider } from "./ai/llm";

// Formatter
export { createFormatter, fileIcon, formatSize, relativeTime, formatDateShort, formatDateTime } from "./formatter/base";
export type { FormatterAdapter, AssignmentWithCourse } from "./formatter/base";

// Platform-specific formatters
export * as telegramFormatter from "./formatter/telegram";
export * as htmlFormatter from "./formatter/html";
