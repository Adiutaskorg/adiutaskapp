import { motion } from "framer-motion";
import { BookOpen, ClipboardList, BarChart3, Calendar, Megaphone } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import type { QuickAction } from "@shared/types";

const ACTION_ICONS: Record<string, React.ElementType> = {
  courses: BookOpen,
  assignments: ClipboardList,
  grades: BarChart3,
  calendar: Calendar,
  announcements: Megaphone,
};

const ACTION_COLORS: Record<string, string> = {
  courses: "bg-brand-600/15 text-brand-400",
  assignments: "bg-accent-warning/15 text-accent-warning",
  grades: "bg-accent-success/15 text-accent-success",
  calendar: "bg-accent-info/15 text-accent-info",
  announcements: "bg-purple-500/15 text-purple-400",
};

interface WelcomeScreenProps {
  actions: readonly QuickAction[] | QuickAction[];
  onAction: (payload: string) => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

export function WelcomeScreen({ actions, onAction }: WelcomeScreenProps) {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-md text-center"
      >
        <h1 className="font-display text-2xl font-bold text-white">
          {getGreeting()}, {firstName}
        </h1>
        <p className="mt-2 text-sm text-surface-400">
          ¿En qué te puedo ayudar hoy?
        </p>

        {/* Quick action cards */}
        <div className="mt-8 grid grid-cols-2 gap-2.5">
          {actions.map((action, i) => {
            const Icon = ACTION_ICONS[action.id] ?? BookOpen;
            const colorClass = ACTION_COLORS[action.id] ?? "bg-surface-800 text-surface-300";

            return (
              <motion.button
                key={action.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.15 + i * 0.06,
                  duration: 0.3,
                  ease: [0.4, 0, 0.2, 1],
                }}
                onClick={() => onAction(action.payload)}
                className="card-hover flex flex-col items-start gap-3 p-4 text-left"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${colorClass}`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <span className="text-sm font-medium text-surface-100">
                  {action.label.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, "")}
                </span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
