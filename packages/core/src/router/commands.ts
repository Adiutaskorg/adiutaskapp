import { CanvasClient } from "../canvas/client";
import { normalize, expandAbbreviations } from "./normalizer";
import { classifyIntent, classifyMessage, type Intent } from "./intent-classifier";
import { extractCourseName, findBestCourseMatch, extractFileQuery, findBestFileMatch } from "./param-extractor";
import type { AssignmentWithCourse } from "../formatter/base";

// Re-export Intent for consumers
export type { Intent } from "./intent-classifier";

export type CommandResult = string | {
  text: string;
  files: { id: number; name: string; size: number }[];
  folders?: { id: number; name: string; files_count: number; folders_count: number }[];
};

// Formatter interface — consumers inject platform-specific formatters
export interface CommandFormatter {
  formatCourses(courses: import("../types/canvas").Course[]): string;
  formatAssignments(assignments: AssignmentWithCourse[], courseName?: string): string;
  formatGrades(grades: import("../types/canvas").Grades[]): string;
  formatEvents(events: import("../types/canvas").CalendarEvent[]): string;
  formatAnnouncements(announcements: import("../types/canvas").Announcement[], courseName?: string): string;
  formatFileMatch(file: import("../types/canvas").CourseFile, courseName: string): string;
  formatFiles(files: import("../types/canvas").CourseFile[], courseName?: string, page?: number, totalPages?: number): string;
  formatFolderContents(folders: import("../types/canvas").CourseFolder[], files: import("../types/canvas").CourseFile[], folderName: string, page?: number, totalPages?: number): string;
  formatHelp(): string;
  formatGreeting(): string;
  formatCoursePrompt(courses: import("../types/canvas").Course[]): string;
  formatMultipleCourses(courses: import("../types/canvas").Course[], query: string): string;
  formatNoCourseFound(query: string, courses: import("../types/canvas").Course[]): string;
}

function intentNeedsCourse(intent: Intent): boolean {
  return intent.type === "assignments" || intent.type === "grades" ||
    intent.type === "announcements" || intent.type === "files";
}

async function executeIntent(
  intent: Intent,
  canvas: CanvasClient,
  normalized: string,
  formatter: CommandFormatter,
  linkMsg: string,
  unlinkMsg: string,
): Promise<CommandResult> {
  switch (intent.type) {
    case "greeting":
      return formatter.formatGreeting();

    case "help":
      return formatter.formatHelp();

    case "link_account":
      return linkMsg;

    case "unlink_account":
      return unlinkMsg;

    case "status":
      return "✅ Tu cuenta de Canvas está vinculada. Puedes usar todos los comandos.";

    case "courses": {
      const courses = await canvas.getCourses();
      return formatter.formatCourses(courses);
    }

    case "assignments": {
      const courses = await canvas.getCourses();
      const courseName = intent.courseName;

      if (courseName) {
        const match = findBestCourseMatch(courses, courseName);
        if (match.type === "single") {
          const assignments = await canvas.getAssignments(match.course.id, true);
          return formatter.formatAssignments(assignments, match.course.name);
        }
        if (match.type === "multiple") {
          return formatter.formatMultipleCourses(match.courses, courseName);
        }
        return formatter.formatNoCourseFound(courseName, courses);
      }

      // All courses — parallel fetch (Phase 6)
      const assignmentResults = await Promise.all(
        courses.map(async (c) => {
          const assignments = await canvas.getAssignments(c.id, true);
          return assignments.map((a) => ({ ...a, _courseName: c.name }));
        })
      );
      const allAssignments: AssignmentWithCourse[] = assignmentResults.flat();
      return formatter.formatAssignments(allAssignments);
    }

    case "grades": {
      const courses = await canvas.getCourses();
      const courseName = intent.courseName;

      if (courseName) {
        const match = findBestCourseMatch(courses, courseName);
        if (match.type === "single") {
          const grades = await canvas.getGrades(match.course.id);
          if (grades.course_name === "") grades.course_name = match.course.name;
          return formatter.formatGrades([grades]);
        }
        if (match.type === "multiple") {
          return formatter.formatMultipleCourses(match.courses, courseName);
        }
        return formatter.formatNoCourseFound(courseName, courses);
      }

      // All courses — parallel fetch (Phase 6)
      const gradeResults = await Promise.allSettled(
        courses.map(async (c) => {
          const grades = await canvas.getGrades(c.id);
          if (grades.course_name === "") grades.course_name = c.name;
          return grades;
        })
      );
      const allGrades = gradeResults
        .filter((r): r is PromiseFulfilledResult<import("../types/canvas").Grades> => r.status === "fulfilled")
        .map((r) => r.value);
      return formatter.formatGrades(allGrades);
    }

    case "calendar": {
      const events = await canvas.getUpcomingEvents(intent.days);
      return formatter.formatEvents(events);
    }

    case "announcements": {
      const courses = await canvas.getCourses();
      const courseName = intent.courseName;

      if (courseName) {
        const match = findBestCourseMatch(courses, courseName);
        if (match.type === "single") {
          const announcements = await canvas.getAnnouncements([match.course.id]);
          return formatter.formatAnnouncements(announcements, match.course.name);
        }
        if (match.type === "multiple") {
          return formatter.formatMultipleCourses(match.courses, courseName);
        }
        return formatter.formatNoCourseFound(courseName, courses);
      }

      const courseIds = courses.map((c) => c.id);
      const announcements = await canvas.getAnnouncements(courseIds);
      return formatter.formatAnnouncements(announcements);
    }

    case "files": {
      const courses = await canvas.getCourses();
      const courseName = intent.courseName;
      const fileExtension = intent.fileExtension;

      if (!courseName) {
        return formatter.formatCoursePrompt(courses);
      }

      const match = findBestCourseMatch(courses, courseName);
      if (match.type === "single") {
        try {
          const files = await canvas.getCourseFiles(match.course.id);

          let filteredFiles = files;
          if (fileExtension) {
            const exts = fileExtension.split(",");
            filteredFiles = files.filter((f) =>
              exts.some((ext: string) => f.display_name.toLowerCase().endsWith(ext))
            );
            if (filteredFiles.length === 0) {
              return `📁 No encontré archivos ${fileExtension} en ${match.course.name}`;
            }
            const text = formatter.formatFiles(filteredFiles, match.course.name);
            return {
              text,
              files: filteredFiles.map((f) => ({ id: f.id, name: f.display_name, size: f.size })),
            };
          }

          const fileQuery = extractFileQuery(normalized, courseName);
          if (fileQuery) {
            const fileMatch = findBestFileMatch(files, fileQuery);
            if (fileMatch.type === "single") {
              const text = formatter.formatFileMatch(fileMatch.file, match.course.name);
              return {
                text,
                files: [{ id: fileMatch.file.id, name: fileMatch.file.display_name, size: fileMatch.file.size }],
              };
            }
            if (fileMatch.type === "multiple") {
              const text = formatter.formatFiles(fileMatch.files, match.course.name);
              return {
                text,
                files: fileMatch.files.map((f) => ({ id: f.id, name: f.display_name, size: f.size })),
              };
            }
          }

          let rootFolders: { id: number; name: string; files_count: number; folders_count: number }[] = [];
          try {
            const allFolders = await canvas.getCourseFolders(match.course.id);
            const rootFolder = allFolders.find((f) => f.parent_folder_id === null)
              ?? allFolders.find((f) => f.full_name.split("/").length === 1);
            if (rootFolder) {
              rootFolders = allFolders
                .filter((f) => f.parent_folder_id === rootFolder.id)
                .filter((f) => f.files_count > 0 || f.folders_count > 0)
                .map((f) => ({ id: f.id, name: f.name, files_count: f.files_count, folders_count: f.folders_count }));
            }
          } catch {
            // Folders not accessible
          }

          const text = rootFolders.length > 0
            ? formatter.formatFolderContents(
                rootFolders.map((f) => ({ ...f, full_name: f.name, parent_folder_id: null })),
                filteredFiles,
                `Archivos de ${match.course.name}`,
              )
            : formatter.formatFiles(filteredFiles, match.course.name);
          return {
            text,
            files: filteredFiles.map((f) => ({ id: f.id, name: f.display_name, size: f.size })),
            folders: rootFolders.length > 0 ? rootFolders : undefined,
          };
        } catch {
          return `📁 No se pudo acceder a los archivos de ${match.course.name}. Es posible que el curso no tenga archivos públicos.`;
        }
      }
      if (match.type === "multiple") {
        return formatter.formatMultipleCourses(match.courses, courseName);
      }
      return formatter.formatNoCourseFound(courseName, courses);
    }

    default:
      return "";
  }
}

/**
 * Route a single message through intent classification and execution.
 */
export async function routeCommand(
  message: string,
  canvas: CanvasClient,
  formatter: CommandFormatter,
  linkMsg = "🔗 Para vincular tu cuenta, usa /vincular y luego envía tu token de Canvas.",
  unlinkMsg = "Para desvincular tu cuenta, usa /desvincular",
): Promise<CommandResult | null> {
  const normalized = normalize(expandAbbreviations(normalize(message.trim())));

  // Try compound intents first (Phase 3 + Phase 7)
  const { intents } = classifyMessage(normalized);

  // Filter out unknown intents
  const validIntents = intents.filter((i) => i.type !== "unknown");
  if (validIntents.length === 0) return null;

  // For each valid intent, extract course name if needed
  for (const intent of validIntents) {
    if (intentNeedsCourse(intent) && !("courseName" in intent && intent.courseName)) {
      const courseName = extractCourseName(normalized);
      if (courseName) {
        Object.assign(intent, { courseName });
      }
    }
  }

  // Single intent — execute normally
  if (validIntents.length === 1) {
    return executeIntent(validIntents[0], canvas, normalized, formatter, linkMsg, unlinkMsg);
  }

  // Compound intents — execute all and concatenate results
  const results = await Promise.all(
    validIntents.map((intent) =>
      executeIntent(intent, canvas, normalized, formatter, linkMsg, unlinkMsg)
    )
  );

  // Merge results
  const texts: string[] = [];
  const allFiles: { id: number; name: string; size: number }[] = [];

  for (const result of results) {
    if (typeof result === "string") {
      texts.push(result);
    } else {
      texts.push(result.text);
      allFiles.push(...result.files);
    }
  }

  const mergedText = texts.join("\n\n---\n\n");
  if (allFiles.length > 0) {
    return { text: mergedText, files: allFiles };
  }
  return mergedText;
}
