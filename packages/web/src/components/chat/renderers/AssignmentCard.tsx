import type { AssignmentInfo } from "@shared/types";
import { Clock, CheckCircle, AlertTriangle, Send } from "lucide-react";
import { clsx } from "clsx";

interface AssignmentCardProps {
  assignment: AssignmentInfo;
}

const STATUS_CONFIG = {
  upcoming: { icon: Clock, color: "text-accent-info", bg: "bg-accent-info/10", label: "Pendiente" },
  overdue: { icon: AlertTriangle, color: "text-accent-danger", bg: "bg-accent-danger/10", label: "Atrasada" },
  submitted: { icon: Send, color: "text-accent-warning", bg: "bg-accent-warning/10", label: "Entregada" },
  graded: { icon: CheckCircle, color: "text-accent-success", bg: "bg-accent-success/10", label: "Calificada" },
} as const;

export function AssignmentCard({ assignment }: AssignmentCardProps) {
  const status = STATUS_CONFIG[assignment.status];
  const StatusIcon = status.icon;

  return (
    <div className="glass-card mt-3 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium text-white">{assignment.name}</h4>
          <p className="text-2xs text-surface-200/60">{assignment.courseName}</p>
        </div>
        <div className={clsx("status-badge", status.bg, status.color)}>
          <StatusIcon className="h-3 w-3" />
          {status.label}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-surface-200">
        {assignment.dueAt && (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(assignment.dueAt).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
        <div>{assignment.pointsPossible} puntos</div>
      </div>

      {assignment.description && (
        <p className="mt-2 line-clamp-2 text-xs text-surface-200/60">
          {assignment.description}
        </p>
      )}
    </div>
  );
}
