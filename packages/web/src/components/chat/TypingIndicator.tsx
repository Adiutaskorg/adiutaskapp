export function TypingIndicator() {
  return (
    <div className="flex justify-start animate-fade-in">
      <div className="chat-bubble chat-bubble-bot">
        <div className="flex items-center gap-1 py-1">
          <span className="h-2 w-2 rounded-full bg-surface-200/50 animate-typing-dot" />
          <span
            className="h-2 w-2 rounded-full bg-surface-200/50 animate-typing-dot"
            style={{ animationDelay: "0.2s" }}
          />
          <span
            className="h-2 w-2 rounded-full bg-surface-200/50 animate-typing-dot"
            style={{ animationDelay: "0.4s" }}
          />
        </div>
      </div>
    </div>
  );
}
