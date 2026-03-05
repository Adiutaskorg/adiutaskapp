import { useState } from "react";
import { motion } from "framer-motion";
import type { FileInfo, FileType } from "@shared/types";
import { API_BASE } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideo2,
  FileAudio,
  FileCode2,
  FileArchive,
  File,
  Presentation,
  ExternalLink,
  ChevronDown,
} from "lucide-react";

interface FileListProps {
  files: FileInfo[];
}

const MAX_VISIBLE = 20;

const FILE_TYPE_ICONS: Record<FileType, typeof FileText> = {
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  powerpoint: Presentation,
  image: FileImage,
  video: FileVideo2,
  audio: FileAudio,
  code: FileCode2,
  archive: FileArchive,
  other: File,
};

const FILE_TYPE_COLORS: Record<FileType, string> = {
  pdf: "text-red-400 bg-red-400/10",
  word: "text-blue-400 bg-blue-400/10",
  excel: "text-green-400 bg-green-400/10",
  powerpoint: "text-orange-400 bg-orange-400/10",
  image: "text-pink-400 bg-pink-400/10",
  video: "text-purple-400 bg-purple-400/10",
  audio: "text-cyan-400 bg-cyan-400/10",
  code: "text-yellow-400 bg-yellow-400/10",
  archive: "text-surface-300 bg-surface-300/10",
  other: "text-surface-400 bg-surface-400/10",
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

export function FileList({ files }: FileListProps) {
  const [expanded, setExpanded] = useState(false);
  const token = useAuthStore((s) => s.token);
  const visibleFiles = expanded ? files : files.slice(0, MAX_VISIBLE);
  const hasMore = files.length > MAX_VISIBLE && !expanded;

  function handleFileClick(file: FileInfo) {
    const base = API_BASE || "";
    // Use token in query param so window.open works without headers
    const url = `${base}${file.url}${token ? `?token=${token}` : ""}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mt-3 space-y-1.5">
      {visibleFiles.map((file, i) => (
        <FileButton key={file.id} file={file} index={i} onClick={() => handleFileClick(file)} />
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/[0.06] bg-surface-800/40 py-2.5 text-xs text-surface-400 transition-colors hover:bg-surface-800/70 hover:text-surface-200"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Ver los {files.length - MAX_VISIBLE} archivos restantes
        </button>
      )}
      <p className="text-2xs text-surface-500 mt-1">
        {files.length} {files.length === 1 ? "archivo encontrado" : "archivos encontrados"}
      </p>
    </div>
  );
}

function FileButton({ file, index, onClick }: { file: FileInfo; index: number; onClick: () => void }) {
  const Icon = FILE_TYPE_ICONS[file.fileType] || File;
  const colorClasses = FILE_TYPE_COLORS[file.fileType] || FILE_TYPE_COLORS.other;
  const label = FILE_TYPE_LABELS[file.fileType] || "Archivo";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 + index * 0.04, duration: 0.25 }}
      className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-left transition-all hover:border-brand-500/30 hover:bg-brand-600/10 active:scale-[0.98]"
      title={`Abrir ${file.name} (${label}, ${file.humanSize})`}
      aria-label={`Abrir archivo ${file.name}, tipo ${label}, tamano ${file.humanSize}`}
    >
      {/* Icon */}
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colorClasses}`}>
        <Icon className="h-4 w-4" />
      </div>

      {/* File info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-surface-100 group-hover:text-white">
          {file.name}
        </p>
        <p className="text-2xs text-surface-500 mt-0.5">
          {label} · {file.humanSize}
          {file.courseName && ` · ${file.courseName}`}
        </p>
      </div>

      {/* Open indicator */}
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-surface-600 transition-colors group-hover:text-brand-400" />
    </motion.button>
  );
}
