import { motion } from "framer-motion";
import { BookOpen, ClipboardList, BarChart3, Calendar, Megaphone } from "lucide-react";
import type { QuickAction } from "@shared/types";

const ACTION_ICONS: Record<string, React.ElementType> = {
  courses: BookOpen,
  assignments: ClipboardList,
  grades: BarChart3,
  calendar: Calendar,
  announcements: Megaphone,
};

interface QuickActionsProps {
  actions: readonly QuickAction[] | QuickAction[];
  onAction: (payload: string) => void;
}

export function QuickActions({ actions, onAction }: QuickActionsProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-2 text-xs text-surface-500">Acciones rápidas</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action, i) => {
          const Icon = ACTION_ICONS[action.id];
          return (
            <motion.button
              key={action.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04, duration: 0.2 }}
              onClick={() => onAction(action.payload)}
              className="quick-action"
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {action.label.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, "")}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
