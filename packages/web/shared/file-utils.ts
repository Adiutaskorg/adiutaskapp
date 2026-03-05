import type { FileType } from "./types/messages";

const MIME_TO_FILE_TYPE: Record<string, FileType> = {
  "application/pdf": "pdf",
  "application/msword": "word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
  "application/vnd.oasis.opendocument.text": "word",
  "application/vnd.ms-excel": "excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
  "application/vnd.oasis.opendocument.spreadsheet": "excel",
  "text/csv": "excel",
  "application/vnd.ms-powerpoint": "powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "powerpoint",
  "application/vnd.oasis.opendocument.presentation": "powerpoint",
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/svg+xml": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "text/html": "code",
  "text/css": "code",
  "text/javascript": "code",
  "application/json": "code",
  "application/zip": "archive",
  "application/x-rar-compressed": "archive",
  "application/gzip": "archive",
  "application/x-7z-compressed": "archive",
};

export function getFileType(mimeType: string): FileType {
  if (MIME_TO_FILE_TYPE[mimeType]) return MIME_TO_FILE_TYPE[mimeType];
  // Check prefix matches (e.g. "image/" for unknown image subtypes)
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "other";
}

export function humanizeSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILE_TYPE_ICONS: Record<FileType, string> = {
  pdf: "\u{1F4C4}",
  word: "\u{1F4DD}",
  excel: "\u{1F4CA}",
  powerpoint: "\u{1F39E}\uFE0F",
  image: "\u{1F5BC}\uFE0F",
  video: "\u{1F3AC}",
  audio: "\u{1F3B5}",
  code: "\u{1F4BB}",
  archive: "\u{1F4E6}",
  other: "\u{1F4CE}",
};

const FILE_TYPE_LABELS: Record<FileType, string> = {
  pdf: "PDF",
  word: "Documento",
  excel: "Hoja de calculo",
  powerpoint: "Presentacion",
  image: "Imagen",
  video: "Video",
  audio: "Audio",
  code: "Codigo",
  archive: "Comprimido",
  other: "Archivo",
};

export function getFileIcon(fileType: FileType): string {
  return FILE_TYPE_ICONS[fileType];
}

export function getFileLabel(fileType: FileType): string {
  return FILE_TYPE_LABELS[fileType];
}
