import { CanvasClient } from "../canvas/client";
import { normalize, expandAbbreviations } from "./normalizer";
import { classifyIntent, type Intent } from "./intent-classifier";
import { extractCourseName, findBestCourseMatch, extractFileQuery, findBestFileMatch } from "./param-extractor";
import {
  formatCourses,
  formatAssignments,
  formatGrades,
  formatEvents,
  formatAnnouncements,
  formatFiles,
  formatFolderContents,
  formatFileMatch,
  formatHelp,
  formatGreeting,
  formatCoursePrompt,
  formatMultipleCourses,
  formatNoCourseFound,
  type AssignmentWithCourse,
} from "./formatter";

export type CommandResult = string | {
  text: string;
  files: { id: number; name: string; size: number }[];
  folders?: { id: number; name: string; files_count: number; folders_count: number }[];
};

function intentNeedsCourse(intent: Intent): boolean {
  return intent.type === "assignments" || intent.type === "grades" ||
    intent.type === "announcements" || intent.type === "files";
}

async function executeIntent(intent: Intent, canvas: CanvasClient, normalized: string): Promise<CommandResult> {
  switch (intent.type) {
    case "greeting":
      return formatGreeting();

    case "help":
      return formatHelp();

    case "link_account":
      return "🔗 Para vincular tu cuenta, usa /vincular y luego envía tu token de Canvas.";

    case "unlink_account":
      return "Para desvincular tu cuenta, usa /desvincular";

    case "status": {
      // The bot handler checks if user is linked before reaching here,
      // so if we're here the user IS linked
      return "✅ Tu cuenta de Canvas está vinculada. Puedes usar todos los comandos.";
    }

    case "courses": {
      const courses = await canvas.getCourses();
      return formatCourses(courses);
    }

    case "assignments": {
      const courses = await canvas.getCourses();
      const courseName = intent.courseName;

      if (courseName) {
        const match = findBestCourseMatch(courses, courseName);
        if (match.type === "single") {
          const assignments = await canvas.getAssignments(match.course.id, true);
          return formatAssignments(assignments, match.course.name);
        }
        if (match.type === "multiple") {
          return formatMultipleCourses(match.courses, courseName);
        }
        return formatNoCourseFound(courseName, courses);
      }

      // All courses — pending only
      const allAssignments: AssignmentWithCourse[] = [];
      for (const c of courses) {
        const assignments = await canvas.getAssignments(c.id, true);
        for (const a of assignments) {
          allAssignments.push({ ...a, _courseName: c.name });
        }
      }
      return formatAssignments(allAssignments);
    }

    case "grades": {
      const courses = await canvas.getCourses();
      const courseName = intent.courseName;

      if (courseName) {
        const match = findBestCourseMatch(courses, courseName);
        if (match.type === "single") {
          const grades = await canvas.getGrades(match.course.id);
          if (grades.course_name === "") grades.course_name = match.course.name;
          return formatGrades([grades]);
        }
        if (match.type === "multiple") {
          return formatMultipleCourses(match.courses, courseName);
        }
        return formatNoCourseFound(courseName, courses);
      }

      // All courses
      const allGrades = [];
      for (const c of courses) {
        try {
          const grades = await canvas.getGrades(c.id);
          if (grades.course_name === "") grades.course_name = c.name;
          allGrades.push(grades);
        } catch {
          // Skip courses without enrollment/grades
        }
      }
      return formatGrades(allGrades);
    }

    case "calendar": {
      const events = await canvas.getUpcomingEvents(intent.days);
      return formatEvents(events);
    }

    case "announcements": {
      const courses = await canvas.getCourses();
      const courseName = intent.courseName;

      if (courseName) {
        const match = findBestCourseMatch(courses, courseName);
        if (match.type === "single") {
          const announcements = await canvas.getAnnouncements([match.course.id]);
          return formatAnnouncements(announcements, match.course.name);
        }
        if (match.type === "multiple") {
          return formatMultipleCourses(match.courses, courseName);
        }
        return formatNoCourseFound(courseName, courses);
      }

      const courseIds = courses.map((c) => c.id);
      const announcements = await canvas.getAnnouncements(courseIds);
      return formatAnnouncements(announcements);
    }

    case "files": {
      const courses = await canvas.getCourses();
      const courseName = intent.courseName;
      const fileExtension = intent.fileExtension;

      if (!courseName) {
        return formatCoursePrompt(courses);
      }

      const match = findBestCourseMatch(courses, courseName);
      if (match.type === "single") {
        try {
          const files = await canvas.getCourseFiles(match.course.id);

          // Apply extension filter if present
          let filteredFiles = files;
          if (fileExtension) {
            const exts = fileExtension.split(",");
            filteredFiles = files.filter((f) =>
              exts.some((ext) => f.display_name.toLowerCase().endsWith(ext))
            );
            if (filteredFiles.length === 0) {
              return `📁 No encontré archivos ${fileExtension} en *${match.course.name}*`;
            }
            const text = formatFiles(filteredFiles, match.course.name);
            return {
              text,
              files: filteredFiles.map((f) => ({ id: f.id, name: f.display_name, size: f.size })),
            };
          }

          // Try fuzzy file search if the user asked for a specific file
          const fileQuery = extractFileQuery(normalized, courseName);
          if (fileQuery) {
            const fileMatch = findBestFileMatch(files, fileQuery);
            if (fileMatch.type === "single") {
              const text = formatFileMatch(fileMatch.file, match.course.name);
              return {
                text,
                files: [{ id: fileMatch.file.id, name: fileMatch.file.display_name, size: fileMatch.file.size }],
              };
            }
            if (fileMatch.type === "multiple") {
              const text = formatFiles(fileMatch.files, match.course.name);
              return {
                text,
                files: fileMatch.files.map((f) => ({ id: f.id, name: f.display_name, size: f.size })),
              };
            }
          }

          // Fetch root folders for navigation
          let rootFolders: { id: number; name: string; files_count: number; folders_count: number }[] = [];
          try {
            const allFolders = await canvas.getCourseFolders(match.course.id);
            // Find the root folder (parent_folder_id === null or the one named "course files")
            const rootFolder = allFolders.find((f) => f.parent_folder_id === null)
              ?? allFolders.find((f) => f.full_name.split("/").length === 1);
            // Get direct children of root
            if (rootFolder) {
              rootFolders = allFolders
                .filter((f) => f.parent_folder_id === rootFolder.id)
                .filter((f) => f.files_count > 0 || f.folders_count > 0)
                .map((f) => ({ id: f.id, name: f.name, files_count: f.files_count, folders_count: f.folders_count }));
            }
          } catch {
            // Folders not accessible, continue with files only
          }

          const text = rootFolders.length > 0
            ? formatFolderContents(
                rootFolders.map((f) => ({ ...f, full_name: f.name, parent_folder_id: null })),
                filteredFiles,
                `Archivos de ${match.course.name}`,
              )
            : formatFiles(filteredFiles, match.course.name);
          return {
            text,
            files: filteredFiles.map((f) => ({ id: f.id, name: f.display_name, size: f.size })),
            folders: rootFolders.length > 0 ? rootFolders : undefined,
          };
        } catch {
          return `📁 No se pudo acceder a los archivos de *${match.course.name}*. Es posible que el curso no tenga archivos públicos.`;
        }
      }
      if (match.type === "multiple") {
        return formatMultipleCourses(match.courses, courseName);
      }
      return formatNoCourseFound(courseName, courses);
    }

    default:
      return "";
  }
}

export async function routeCommand(message: string, canvas: CanvasClient): Promise<CommandResult | null> {
  const normalized = normalize(expandAbbreviations(normalize(message.trim())));
  const intent = classifyIntent(normalized);

  if (intent.type === "unknown") return null;

  // Extract course name for intents that need it
  if (intentNeedsCourse(intent) && !("courseName" in intent && intent.courseName)) {
    const courseName = extractCourseName(normalized);
    if (courseName && "courseName" in intent) {
      (intent as { courseName?: string }).courseName = courseName;
    } else if (courseName) {
      // Attach courseName to the intent
      Object.assign(intent, { courseName });
    }
  }

  return executeIntent(intent, canvas, normalized);
}
