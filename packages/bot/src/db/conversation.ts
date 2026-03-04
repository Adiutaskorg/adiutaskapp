import type Database from "better-sqlite3";
import { config } from "../config";
import type { ConversationMessage } from "./schema";

interface DbRow {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export class ConversationStore {
  private db: Database.Database;
  private cache = new Map<string, ConversationMessage[]>();

  constructor(db: Database.Database) {
    this.db = db;
  }

  addMessage(telegramId: string, role: "user" | "assistant", content: string): void {
    this.db
      .prepare("INSERT INTO conversation_history (telegram_id, role, content) VALUES (?, ?, ?)")
      .run(telegramId, role, content);

    // Update cache
    const cached = this.cache.get(telegramId) ?? [];
    cached.push({ role, content, created_at: new Date().toISOString() });
    // Keep only the last N messages in cache
    if (cached.length > config.conversationMaxMessages) {
      cached.splice(0, cached.length - config.conversationMaxMessages);
    }
    this.cache.set(telegramId, cached);

    // Prune old messages for this user
    const ttlMinutes = config.conversationTtlMinutes;
    this.db
      .prepare(`DELETE FROM conversation_history WHERE telegram_id = ? AND created_at < datetime('now', ?)`)
      .run(telegramId, `-${ttlMinutes} minutes`);
  }

  getHistory(telegramId: string): ConversationMessage[] {
    // Check cache first
    const cached = this.cache.get(telegramId);
    if (cached) return cached;

    const ttlMinutes = config.conversationTtlMinutes;
    const maxMessages = config.conversationMaxMessages;

    const rows = this.db
      .prepare(
        `SELECT role, content, created_at FROM conversation_history
         WHERE telegram_id = ? AND created_at >= datetime('now', ?)
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(telegramId, `-${ttlMinutes} minutes`, maxMessages) as DbRow[];

    const history = rows.reverse().map((row) => ({
      role: row.role,
      content: row.content,
      created_at: row.created_at,
    }));

    this.cache.set(telegramId, history);
    return history;
  }

  clearHistory(telegramId: string): void {
    this.db.prepare("DELETE FROM conversation_history WHERE telegram_id = ?").run(telegramId);
    this.cache.delete(telegramId);
    console.log(`[CONV] Cleared history for ${telegramId}`);
  }

  pruneOld(): void {
    const ttlMinutes = config.conversationTtlMinutes;
    const result = this.db
      .prepare(`DELETE FROM conversation_history WHERE created_at < datetime('now', ?)`)
      .run(`-${ttlMinutes} minutes`);
    if (result.changes > 0) {
      console.log(`[CONV] Pruned ${result.changes} old messages`);
    }
    this.cache.clear();
  }
}
