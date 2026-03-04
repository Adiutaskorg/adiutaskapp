import { memo } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "@shared/types";
import { GradesTable } from "./renderers/GradesTable";
import { AssignmentCard } from "./renderers/AssignmentCard";
import { FileList } from "./renderers/FileList";
import { clsx } from "clsx";
import { AlertCircle, Bot } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface ChatBubbleProps {
  message: ChatMessage;
  index?: number;
}

export const ChatBubble = memo(function ChatBubble({ message, index = 0 }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isError = message.responseType === "error";

  const relativeTime = formatDistanceToNow(new Date(message.timestamp), {
    addSuffix: true,
    locale: es,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay: Math.min(index * 0.05, 0.3),
        ease: [0.4, 0, 0.2, 1],
      }}
      className={clsx(
        "flex gap-2.5",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {/* Bot avatar */}
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600/20">
          <Bot className="h-3.5 w-3.5 text-brand-400" />
        </div>
      )}

      <div className={clsx("min-w-0", isUser ? "max-w-[80%]" : "max-w-[85%] flex-1")}>
        {/* Message content */}
        <div
          className={clsx(
            isUser && "chat-bubble chat-bubble-user",
            !isUser && !isError && "chat-bubble-bot",
            isError && "chat-bubble-bot rounded-xl border border-accent-danger/20 bg-accent-danger/5 p-3"
          )}
        >
          {/* Error icon */}
          {isError && (
            <div className="mb-1.5 flex items-center gap-1.5 text-accent-danger">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Error</span>
            </div>
          )}

          {/* Text content */}
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {message.content}
            </p>
          ) : (
            <div className="markdown-content">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}

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
        </div>

        {/* Timestamp */}
        <div
          className={clsx(
            "mt-1 flex items-center gap-1.5 text-2xs",
            isUser ? "justify-end text-surface-400" : "text-surface-500"
          )}
        >
          <span>{relativeTime}</span>
          {message.metadata?.resolvedBy && (
            <span className="opacity-50">
              · vía {message.metadata.resolvedBy}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
});
