import dotenv from "dotenv";
dotenv.config();

export const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  canvasApiUrl: process.env.CANVAS_BASE_URL ?? process.env.CANVAS_API_URL ?? "https://ufv-es.instructure.com",
  canvasApiToken: process.env.CANVAS_API_TOKEN ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  encryptionKey: process.env.ENCRYPTION_KEY ?? "",
  conversationMaxMessages: 20,
  conversationTtlMinutes: 120,
  llmMaxTokens: 2048,
  notificationIntervalMinutes: 30,
};

export const LLM_ENABLED = !!process.env.ANTHROPIC_API_KEY || !!process.env.GEMINI_API_KEY;
