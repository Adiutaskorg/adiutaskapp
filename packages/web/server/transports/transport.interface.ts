// ============================================
// Message Transport Abstraction
//
// This is the pattern that lets you run the SAME
// bot logic across Telegram, WhatsApp, PWA, or
// any future platform.
//
// Each transport implements this interface, and
// the bot engine doesn't care where the message
// came from.
// ============================================

import type { BotResponse } from "../services/bot.engine";

/**
 * A structured response that can be rendered differently
 * depending on the transport layer.
 */
export interface TransportResponse {
  text: string;
  /** Rich content that the transport can render (or ignore) */
  richContent?: BotResponse["metadata"];
  /** Quick reply buttons/suggestions */
  quickReplies?: Array<{ label: string; payload: string }>;
}

/**
 * Abstract interface for message transports.
 * Implement this for each platform you want to support.
 */
export interface MessageTransport {
  /** Unique name of this transport */
  readonly name: string;

  /** Start listening for messages */
  start(): Promise<void>;

  /** Stop listening */
  stop(): Promise<void>;

  /** Register the handler that processes incoming messages */
  onMessage(
    handler: (userId: string, text: string) => Promise<TransportResponse>
  ): void;
}

// ============================================
// PWA WebSocket Transport
// (Already implemented in ws.handler.ts — this
//  is the conceptual interface it follows)
// ============================================

// ============================================
// Telegram Transport
// Wraps your existing grammy bot
// ============================================

/**
 * Example Telegram transport implementation.
 * Adapt this to your existing grammy setup.
 *
 * ```typescript
 * import { Bot } from "grammy";
 * import { processMessage } from "../services/bot.engine";
 *
 * export class TelegramTransport implements MessageTransport {
 *   readonly name = "telegram";
 *   private bot: Bot;
 *   private handler?: (userId: string, text: string) => Promise<TransportResponse>;
 *
 *   constructor(token: string) {
 *     this.bot = new Bot(token);
 *   }
 *
 *   async start() {
 *     this.bot.on("message:text", async (ctx) => {
 *       if (!this.handler) return;
 *       const userId = String(ctx.from.id);
 *       const response = await this.handler(userId, ctx.message.text);
 *
 *       // Render for Telegram (with inline keyboards, etc.)
 *       await ctx.reply(response.text, {
 *         reply_markup: response.quickReplies
 *           ? {
 *               inline_keyboard: [
 *                 response.quickReplies.map((r) => ({
 *                   text: r.label,
 *                   callback_data: r.payload,
 *                 })),
 *               ],
 *             }
 *           : undefined,
 *       });
 *     });
 *
 *     await this.bot.start();
 *   }
 *
 *   async stop() {
 *     await this.bot.stop();
 *   }
 *
 *   onMessage(handler: (userId: string, text: string) => Promise<TransportResponse>) {
 *     this.handler = handler;
 *   }
 * }
 * ```
 */

// ============================================
// Transport Manager
// Runs multiple transports simultaneously
// ============================================

export class TransportManager {
  private transports: MessageTransport[] = [];

  /** Register a transport */
  register(transport: MessageTransport) {
    this.transports.push(transport);
    console.log(`🔌 Transport registered: ${transport.name}`);
  }

  /** Start all transports */
  async startAll() {
    await Promise.all(
      this.transports.map(async (t) => {
        try {
          await t.start();
          console.log(`✅ Transport started: ${t.name}`);
        } catch (err) {
          console.error(`❌ Transport failed to start: ${t.name}`, err);
        }
      })
    );
  }

  /** Stop all transports gracefully */
  async stopAll() {
    await Promise.all(
      this.transports.map(async (t) => {
        try {
          await t.stop();
        } catch (err) {
          console.error(`Error stopping transport ${t.name}:`, err);
        }
      })
    );
  }
}
