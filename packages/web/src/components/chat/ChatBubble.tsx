import { memo } from "react";
import type { ChatMessage } from "@shared/types";
import { GradesTable } from "./renderers/GradesTable";
import { AssignmentCard } from "./renderers/AssignmentCard";
import { FileList } from "./renderers/FileList";
import { clsx } from "clsx";
import { AlertCircle } from "lucide-react";

interface ChatBubbleProps {
  message: ChatMessage;
}

export const ChatBubble = memo(function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isError = message.responseType === "error";

  return (
    <div
      className={clsx(
        "flex animate-slide-up",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={clsx(
          "chat-bubble",
          isUser && "chat-bubble-user",
          !isUser && !isError && "chat-bubble-bot",
          isError &&
            "chat-bubble-bot border border-accent-danger/30 bg-accent-danger/10"
        )}
      >
        {/* Error icon */}
        {isError && (
          <div className="mb-1 flex items-center gap-1.5 text-accent-danger">
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Error</span>
          </div>
        )}

        {/* Text content */}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </p>

        {/* Rich content renderers */}
        {message.metadata?.grades && (
          <GradesTable grades={message.metadata.grades} />
        )}
        {message.metadata?.assignment && (
          <AssignmentCard assignment={message.metadata.assignment} />
        )}
        {message.metadata?.files && (
          <FileList files={message.metadata.files} />
        )}

        {/* Timestamp */}
        <div
          className={clsx(
            "mt-1 text-2xs",
            isUser ? "text-white/50" : "text-surface-200/40"
          )}
        >
          {new Date(message.timestamp).toLocaleTimeString("es-ES", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {message.metadata?.resolvedBy && (
            <span className="ml-2 opacity-50">
              vía {message.metadata.resolvedBy}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
