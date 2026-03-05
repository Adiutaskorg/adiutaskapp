// ============================================
// Database Module
// SQLite via Bun's native driver
// ============================================

import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { encryptToken, decryptToken, isEncryptionConfigured } from "../lib/crypto";

const DB_PATH = process.env.DATABASE_URL || "./data/adiutask.db";

let db: Database;

/** Initialize the database and run migrations */
export async function initDatabase(): Promise<void> {
  // Ensure data directory exists
  const dir = join(DB_PATH, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  // Run migrations
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      sso_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      canvas_token TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscription TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'bot', 'system')),
      content TEXT NOT NULL,
      response_type TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_chat_history_user
    ON chat_history(user_id, created_at DESC)
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sent_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      sent_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_sent_notifications_lookup
    ON sent_notifications(user_id, type, reference_id)
  `);

  console.log("📦 Database initialized");
}

/** Find or create a user from SSO data */
export async function findOrCreateUser(data: {
  ssoId: string;
  email: string;
  name: string;
}): Promise<{ id: string; email: string; name: string }> {
  // Try to find by sso_id first, then by email
  const existing = db
    .query<{ id: string; email: string; name: string }, [string]>(
      "SELECT id, email, name FROM users WHERE sso_id = ?"
    )
    .get(data.ssoId)
    ?? db
    .query<{ id: string; email: string; name: string }, [string]>(
      "SELECT id, email, name FROM users WHERE email = ?"
    )
    .get(data.email);

  if (existing) {
    // Update sso_id, name, email if changed
    db.run("UPDATE users SET sso_id = ?, email = ?, name = ?, updated_at = datetime('now') WHERE id = ?", [
      data.ssoId,
      data.email,
      data.name,
      existing.id,
    ]);
    return { ...existing, email: data.email, name: data.name };
  }

  const id = crypto.randomUUID();
  db.run("INSERT INTO users (id, sso_id, email, name) VALUES (?, ?, ?, ?)", [
    id,
    data.ssoId,
    data.email,
    data.name,
  ]);

  return { id, email: data.email, name: data.name };
}

/** Get a user by ID (includes hasCanvas flag) */
export async function getUserById(userId: string): Promise<{ id: string; email: string; name: string; hasCanvas: boolean } | null> {
  const row = db
    .query<{ id: string; email: string; name: string; canvas_token: string | null }, [string]>(
      "SELECT id, email, name, canvas_token FROM users WHERE id = ?"
    )
    .get(userId);
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, hasCanvas: !!row.canvas_token };
}

/** Remove a user's Canvas token (unlink) */
export async function removeCanvasToken(userId: string): Promise<void> {
  db.run("UPDATE users SET canvas_token = NULL, updated_at = datetime('now') WHERE id = ?", [userId]);
}

/** Get a user's Canvas API token (decrypted if encryption is configured) */
export async function getUserCanvasToken(userId: string): Promise<string | null> {
  const row = db
    .query<{ canvas_token: string | null }, [string]>(
      "SELECT canvas_token FROM users WHERE id = ?"
    )
    .get(userId);

  const token = row?.canvas_token ?? null;
  if (!token) return null;

  // Decrypt if the token looks encrypted (contains ':' separator from AES-GCM format)
  if (isEncryptionConfigured() && token.includes(":")) {
    try {
      return await decryptToken(token);
    } catch {
      // Fallback: might be a legacy plaintext token
      return token;
    }
  }
  return token;
}

/** Save a push notification subscription */
export async function savePushSubscription(userId: string, subscription: unknown): Promise<void> {
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO push_subscriptions (id, user_id, subscription) 
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET subscription = excluded.subscription`,
    [id, userId, JSON.stringify(subscription)]
  );
}

/** Delete a push notification subscription */
export async function deletePushSubscription(userId: string): Promise<void> {
  db.run("DELETE FROM push_subscriptions WHERE user_id = ?", [userId]);
}

/** Save or update a Canvas API token for a user (encrypted if configured) */
export async function saveCanvasToken(userId: string, canvasToken: string): Promise<void> {
  const tokenToStore = isEncryptionConfigured()
    ? await encryptToken(canvasToken)
    : canvasToken;

  db.run(
    "UPDATE users SET canvas_token = ?, updated_at = datetime('now') WHERE id = ?",
    [tokenToStore, userId]
  );
}

/** Save a chat message to history */
export async function saveChatMessage(
  userId: string,
  role: string,
  content: string,
  responseType?: string,
  metadata?: unknown
): Promise<void> {
  db.run(
    `INSERT INTO chat_history (id, user_id, role, content, response_type, metadata) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      userId,
      role,
      content,
      responseType || null,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

/** Get recent chat history for a user */
export async function getChatHistory(userId: string, limit = 50) {
  return db
    .query(
      `SELECT id, role, content, response_type, metadata, created_at
       FROM chat_history WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(userId, limit);
}

/** Check if a notification has already been sent */
export function hasNotificationBeenSent(userId: string, type: string, referenceId: string): boolean {
  const row = db
    .query<{ cnt: number }, [string, string, string]>(
      "SELECT COUNT(*) as cnt FROM sent_notifications WHERE user_id = ? AND type = ? AND reference_id = ?"
    )
    .get(userId, type, referenceId);
  return (row?.cnt ?? 0) > 0;
}

/** Mark a notification as sent */
export function markNotificationSent(userId: string, type: string, referenceId: string): void {
  db.run(
    "INSERT INTO sent_notifications (user_id, type, reference_id) VALUES (?, ?, ?)",
    [userId, type, referenceId]
  );
}

/** Remove notifications older than N days */
export function pruneOldNotifications(days = 7): void {
  db.run(
    `DELETE FROM sent_notifications WHERE sent_at < datetime('now', '-' || ? || ' days')`,
    [days]
  );
}

/** Get all users that have a push subscription and a canvas token */
export function getUsersWithPushSubscriptions(): Array<{
  userId: string;
  subscription: string;
  canvasToken: string;
}> {
  return db
    .query<{ user_id: string; subscription: string; canvas_token: string }, []>(
      `SELECT ps.user_id, ps.subscription, u.canvas_token
       FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       WHERE u.canvas_token IS NOT NULL`
    )
    .all()
    .map((row) => ({
      userId: row.user_id,
      subscription: row.subscription,
      canvasToken: row.canvas_token,
    }));
}

/** Delete a push subscription by user ID (used when subscription expires) */
export function deletePushSubscriptionSync(userId: string): void {
  db.run("DELETE FROM push_subscriptions WHERE user_id = ?", [userId]);
}
