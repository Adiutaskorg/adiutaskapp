const TZ = "Europe/Madrid";

export function formatDateShort(iso: string | null): string {
  if (!iso) return "sin fecha";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "sin fecha";
  const d = new Date(iso);
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
}

export function relativeTime(iso: string): string {
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

export function formatSize(bytes: number): string {
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
