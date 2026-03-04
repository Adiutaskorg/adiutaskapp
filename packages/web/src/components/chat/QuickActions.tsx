import type { QuickAction } from "@shared/types";

interface QuickActionsProps {
  actions: readonly QuickAction[] | QuickAction[];
  onAction: (payload: string) => void;
}

export function QuickActions({ actions, onAction }: QuickActionsProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-2 text-xs text-surface-200/50">Accesos rápidos</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => onAction(action.payload)}
            className="quick-action"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
