import { motion } from "framer-motion";
import type { FileInfo } from "@shared/types";
import { FileText, Download, Image, FileSpreadsheet, File } from "lucide-react";

interface FileListProps {
  files: FileInfo[];
}

const FILE_ICONS: Record<string, typeof FileText> = {
  "application/pdf": FileText,
  "image/": Image,
  "application/vnd.openxmlformats-officedocument.spreadsheetml": FileSpreadsheet,
};

function getFileIcon(contentType: string) {
  for (const [prefix, Icon] of Object.entries(FILE_ICONS)) {
    if (contentType.startsWith(prefix)) return Icon;
  }
  return File;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileList({ files }: FileListProps) {
  return (
    <div className="mt-3 space-y-1.5">
      {files.map((file, i) => {
        const Icon = getFileIcon(file.contentType);
        return (
          <motion.a
            key={file.id}
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.05, duration: 0.25 }}
            className="card-hover flex items-center gap-3 p-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600/15">
              <Icon className="h-4 w-4 text-brand-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-surface-100">{file.name}</p>
              <p className="text-2xs text-surface-500">
                {file.courseName} · {formatSize(file.size)}
              </p>
            </div>
            <Download className="h-4 w-4 shrink-0 text-surface-600 transition-colors group-hover:text-surface-300" />
          </motion.a>
        );
      })}
    </div>
  );
}
