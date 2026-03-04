import { useRef, useEffect } from "react";
import { useChatStore } from "@/stores/chat.store";
import { useAuthStore } from "@/stores/auth.store";
import { ChatBubble } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import { TypingIndicator } from "./TypingIndicator";
import { QuickActions } from "./QuickActions";
import { useWebSocket } from "@/hooks/useWebSocket";

export function ChatView() {
  const messages = useChatStore((s) => s.messages);
  const isTyping = useChatStore((s) => s.isTyping);
  const quickActions = useChatStore((s) => s.quickActions);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Single WebSocket connection for the entire chat
  const { sendMessage } = useWebSocket({ enabled: isAuthenticated });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isTyping]);

  const handleSend = (text: string) => {
    sendMessage(text);
  };

  const handleQuickAction = (payload: string) => {
    sendMessage(payload);
  };

  const showQuickActions = messages.length <= 1;

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="scrollbar-hidden flex-1 overflow-y-auto px-4 py-4"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}

          {isTyping && <TypingIndicator />}
        </div>
      </div>

      {/* Quick actions (shown only at start) */}
      {showQuickActions && (
        <div className="border-t border-white/5 px-4 py-3">
          <QuickActions actions={quickActions} onAction={handleQuickAction} />
        </div>
      )}

      {/* Input area */}
      <ChatInput onSend={handleSend} />
    </div>
  );
}
