import { motion } from "framer-motion";
import type { AssignmentInfo } from "@shared/types";
import { Clock, CheckCircle, AlertTriangle, Send } from "lucide-react";
import { clsx } from "clsx";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface AssignmentCardProps {
  assignment: AssignmentInfo;
}

const STATUS_CONFIG = {
  upcoming: {
    icon: Clock,
    color: "text-accent-info",
    bg: "bg-accent-info/10",
    border: "border-l-accent-info",
    label: "Pendiente",
  },
  overdue: {
    icon: AlertTriangle,
    color: "text-accent-danger",
    bg: "bg-accent-danger/10",
    border: "border-l-accent-danger",
    label: "Atrasada",
  },
  submitted: {
    icon: Send,
    color: "text-accent-warning",
    bg: "bg-accent-warning/10",
    border: "border-l-accent-warning",
    label: "Entregada",
  },
  graded: {
    icon: CheckCircle,
    color: "text-accent-success",
    bg: "bg-accent-success/10",
    border: "border-l-accent-success",
    label: "Calificada",
  },
} as const;

export function AssignmentCard({ assignment }: AssignmentCardProps) {
  const status = STATUS_CONFIG[assignment.status];
  const StatusIcon = status.icon;

  const relativeDate = assignment.dueAt
    ? formatDistanceToNow(new Date(assignment.dueAt), { addSuffix: true, locale: es })
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.3 }}
      className={clsx(
        "card mt-3 border-l-2 p-3.5",
        status.border
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-white">{assignment.name}</h4>
          <p className="text-2xs text-surface-400">{assignment.courseName}</p>
        </div>
        <div className={clsx("status-badge shrink-0", status.bg, status.color)}>
          <StatusIcon className="h-3 w-3" />
          {status.label}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-surface-400">
        {assignment.dueAt && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            <span>{relativeDate}</span>
          </div>
        )}
        <div className="font-mono">{assignment.pointsPossible} pts</div>
      </div>

      {assignment.description && (
        <p className="mt-2 line-clamp-2 text-xs text-surface-400">
          {assignment.description}
        </p>
      )}
    </motion.div>
  );
}
