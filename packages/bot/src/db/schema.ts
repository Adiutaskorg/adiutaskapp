export const CREATE_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY,
    canvas_token TEXT NOT NULL,
    canvas_user_id INTEGER NOT NULL,
    canvas_name TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    token_expires_at DATETIME,
    notifications_enabled INTEGER NOT NULL DEFAULT 1
  )
`;

export const MIGRATE_USERS_NOTIFICATIONS = `
  ALTER TABLE users ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1
`;

export const CREATE_SENT_NOTIFICATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS sent_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL,
    type TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    sent_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(telegram_id, type, reference_id)
  )
`;

export const CREATE_SENT_NOTIFICATIONS_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_sent_notifications_user
  ON sent_notifications (telegram_id, type, reference_id)
`;

export const CREATE_CONVERSATION_TABLE = `
  CREATE TABLE IF NOT EXISTS conversation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now'))
  )
`;

export const CREATE_CONVERSATION_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_conversation_user_time
  ON conversation_history (telegram_id, created_at DESC)
`;

export interface User {
  telegram_id: string;
  canvas_token: string;
  canvas_user_id: number;
  canvas_name: string;
  created_at: string;
  token_expires_at: string | null;
  notifications_enabled: number;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
