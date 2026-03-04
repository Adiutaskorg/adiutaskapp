import { useState, useRef, useCallback } from "react";
import { Send } from "lucide-react";
import { motion } from "framer-motion";

interface ChatInputProps {
  onSend: (text: string) => void;
}

export function ChatInput({ onSend }: ChatInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [text, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const hasText = text.trim().length > 0;

  return (
    <div className="border-t border-white/[0.06] bg-surface-900/60 px-4 py-3 pb-safe backdrop-blur-xl">
      <div className="mx-auto flex max-w-2xl items-end gap-2">
        <div className="card flex flex-1 items-end overflow-hidden">
          <textarea
            ref={inputRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu mensaje..."
            rows={1}
            className="w-full resize-none bg-transparent px-4 py-3 text-sm text-white
                       placeholder-surface-500 outline-none"
          />
          <motion.button
            onClick={handleSend}
            disabled={!hasText}
            whileTap={{ scale: 0.92 }}
            className="mb-1.5 mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
                       bg-brand-600 text-white transition-all
                       hover:bg-brand-500
                       disabled:opacity-0 disabled:pointer-events-none"
          >
            <Send className="h-3.5 w-3.5" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
