import type { ConversationMessage } from "@adiutask/core";

// Re-export for backwards compatibility
export type { ConversationMessage };

const MAX_MESSAGES = 20;
const TTL_MINUTES = 120;

/**
 * In-memory conversation store for tracking chat history per user.
 * Used by Tier 2 (context resolver) and Tier 3 (LLM) for conversation continuity.
 */
export class ConversationStore {
  private cache = new Map<string, ConversationMessage[]>();

  addMessage(userId: string, role: "user" | "assistant", content: string): void {
    const messages = this.cache.get(userId) ?? [];
    messages.push({ role, content, created_at: new Date().toISOString() });

    // Keep only the last N messages
    if (messages.length > MAX_MESSAGES) {
      messages.splice(0, messages.length - MAX_MESSAGES);
    }

    this.cache.set(userId, messages);
  }

  getHistory(userId: string): ConversationMessage[] {
    const messages = this.cache.get(userId) ?? [];
    // Filter out old messages
    const cutoff = Date.now() - TTL_MINUTES * 60 * 1000;
    return messages.filter((m) => new Date(m.created_at).getTime() > cutoff);
  }

  clearHistory(userId: string): void {
    this.cache.delete(userId);
  }
}
