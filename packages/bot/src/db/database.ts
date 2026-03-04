import crypto from "node:crypto";
import Database from "better-sqlite3";
import {
  CREATE_USERS_TABLE,
  CREATE_CONVERSATION_TABLE,
  CREATE_CONVERSATION_INDEX,
  MIGRATE_USERS_NOTIFICATIONS,
  CREATE_SENT_NOTIFICATIONS_TABLE,
  CREATE_SENT_NOTIFICATIONS_INDEX,
  type User,
} from "./schema";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY is not set");
  // Expect a 64-char hex string (32 bytes)
  if (key.length !== 64) throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  return Buffer.from(key, "hex");
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(stored: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

export class AppDatabase {
  private db: Database.Database;

  constructor(path = "bot.db") {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  private init(): void {
    this.db.exec(CREATE_USERS_TABLE);
    this.db.exec(CREATE_CONVERSATION_TABLE);
    this.db.exec(CREATE_CONVERSATION_INDEX);
    this.db.exec(CREATE_SENT_NOTIFICATIONS_TABLE);
    this.db.exec(CREATE_SENT_NOTIFICATIONS_INDEX);

    // Migration: add notifications_enabled column if missing
    const cols = this.db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "notifications_enabled")) {
      this.db.exec(MIGRATE_USERS_NOTIFICATIONS);
      console.log("[DB] Migrated users table: added notifications_enabled");
    }

    console.log("[DB] Database initialized");
  }

  getDb(): Database.Database {
    return this.db;
  }

  saveUser(
    telegramId: string,
    canvasToken: string,
    canvasUserId: number,
    canvasName: string,
    expiresAt?: string
  ): void {
    const encryptedToken = encrypt(canvasToken);
    this.db
      .prepare(
        `INSERT INTO users (telegram_id, canvas_token, canvas_user_id, canvas_name, token_expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(telegram_id) DO UPDATE SET
           canvas_token = excluded.canvas_token,
           canvas_user_id = excluded.canvas_user_id,
           canvas_name = excluded.canvas_name,
           token_expires_at = excluded.token_expires_at`
      )
      .run(telegramId, encryptedToken, canvasUserId, canvasName, expiresAt ?? null);
    console.log(`[DB] User saved: ${telegramId}`);
  }

  getUser(telegramId: string): User | null {
    const row = this.db
      .prepare("SELECT * FROM users WHERE telegram_id = ?")
      .get(telegramId) as User | undefined;
    if (!row) return null;
    return { ...row, canvas_token: decrypt(row.canvas_token) };
  }

  deleteUser(telegramId: string): void {
    this.db.prepare("DELETE FROM users WHERE telegram_id = ?").run(telegramId);
    console.log(`[DB] User deleted: ${telegramId}`);
  }

  getAllUsers(): User[] {
    const rows = this.db.prepare("SELECT * FROM users").all() as User[];
    return rows.map((row) => ({ ...row, canvas_token: decrypt(row.canvas_token) }));
  }

  // --- Notification methods ---

  hasNotificationBeenSent(telegramId: string, type: string, referenceId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM sent_notifications WHERE telegram_id = ? AND type = ? AND reference_id = ?")
      .get(telegramId, type, referenceId);
    return !!row;
  }

  markNotificationSent(telegramId: string, type: string, referenceId: string): void {
    this.db
      .prepare("INSERT OR IGNORE INTO sent_notifications (telegram_id, type, reference_id) VALUES (?, ?, ?)")
      .run(telegramId, type, referenceId);
  }

  pruneOldNotifications(days = 7): void {
    const result = this.db
      .prepare("DELETE FROM sent_notifications WHERE sent_at < datetime('now', ?)")
      .run(`-${days} days`);
    if (result.changes > 0) {
      console.log(`[DB] Pruned ${result.changes} old notifications`);
    }
  }

  setNotificationsEnabled(telegramId: string, enabled: boolean): void {
    this.db
      .prepare("UPDATE users SET notifications_enabled = ? WHERE telegram_id = ?")
      .run(enabled ? 1 : 0, telegramId);
  }

  isNotificationsEnabled(telegramId: string): boolean {
    const row = this.db
      .prepare("SELECT notifications_enabled FROM users WHERE telegram_id = ?")
      .get(telegramId) as { notifications_enabled: number } | undefined;
    return row?.notifications_enabled === 1;
  }

  hasAnyNotificationForPrefix(telegramId: string, type: string, refPrefix: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM sent_notifications WHERE telegram_id = ? AND type = ? AND reference_id LIKE ? LIMIT 1")
      .get(telegramId, type, refPrefix + "%");
    return !!row;
  }

  getUsersWithNotifications(): User[] {
    const rows = this.db
      .prepare("SELECT * FROM users WHERE notifications_enabled = 1")
      .all() as User[];
    return rows.map((row) => ({ ...row, canvas_token: decrypt(row.canvas_token) }));
  }

  close(): void {
    this.db.close();
  }
}

// --- Self-test when run directly ---
if (require.main === module) {
  // Use a temporary key for testing
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

  const db = new AppDatabase(":memory:");

  console.log("=== DB Self-Test ===\n");

  // Create
  db.saveUser("12345", "canvas-secret-token-abc", 101, "Test User", "2026-12-31T23:59:59Z");
  console.log("[+] User saved");

  // Read
  const user = db.getUser("12345");
  console.log("[+] User read:", user);
  console.assert(user !== null, "User should exist");
  console.assert(user!.canvas_token === "canvas-secret-token-abc", "Token should be decrypted");
  console.assert(user!.canvas_user_id === 101, "Canvas user ID should match");

  // List all
  const all = db.getAllUsers();
  console.log(`[+] All users (${all.length}):`, all);
  console.assert(all.length === 1, "Should have 1 user");

  // Delete
  db.deleteUser("12345");
  const deleted = db.getUser("12345");
  console.assert(deleted === null, "User should be deleted");
  console.log("[+] User deleted");

  db.close();
  console.log("\n=== All tests passed ===");
}
