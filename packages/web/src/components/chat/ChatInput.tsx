import { useState, useRef, useCallback } from "react";
import { Send } from "lucide-react";

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
    // Reset textarea height
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
    // Auto-resize textarea
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  return (
    <div className="border-t border-white/5 bg-surface-900/60 px-4 py-3 pb-safe backdrop-blur-lg">
      <div className="mx-auto flex max-w-2xl items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={inputRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu mensaje..."
            rows={1}
            className="w-full resize-none rounded-2xl border border-surface-700 bg-surface-800/80 
                       px-4 py-3 pr-12 text-sm text-white placeholder-surface-200/40
                       outline-none transition-colors
                       focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/25"
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl 
                     bg-brand-600 text-white transition-all
                     hover:bg-brand-500 active:scale-95
                     disabled:opacity-30 disabled:hover:bg-brand-600"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
