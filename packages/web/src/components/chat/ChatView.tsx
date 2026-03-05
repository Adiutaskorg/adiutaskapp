import { useRef, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useChatStore } from "@/stores/chat.store";
import { ChatBubble } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import { TypingIndicator } from "./TypingIndicator";
import { WelcomeScreen } from "./WelcomeScreen";

interface AppOutletContext {
  sendMessage: (text: string) => void;
}

export function ChatView() {
  const messages = useChatStore((s) => s.messages);
  const isTyping = useChatStore((s) => s.isTyping);
  const quickActions = useChatStore((s) => s.quickActions);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { sendMessage } = useOutletContext<AppOutletContext>();

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

  // Show welcome screen when only the welcome message exists
  const showWelcome = messages.length <= 1;

  if (showWelcome) {
    return (
      <div className="flex h-full flex-col">
        <WelcomeScreen actions={quickActions} onAction={handleQuickAction} />
        <ChatInput onSend={handleSend} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="scrollbar-hidden flex-1 overflow-y-auto px-4 py-4"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.map((msg, i) => (
            <ChatBubble key={msg.id} message={msg} index={i} />
          ))}

          <AnimatePresence>
            {isTyping && <TypingIndicator />}
          </AnimatePresence>
        </div>
      </div>

      {/* Input area */}
      <ChatInput onSend={handleSend} />
    </div>
  );
}
