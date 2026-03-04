import { LLM_ENABLED } from "./config";
import { createBot } from "./bot/telegram";
import { AppDatabase } from "./db/database";
import { ConversationStore } from "./db/conversation";
import { createLLMProvider } from "./ai/llm";
import { NotificationScheduler } from "./scheduler/notifications";

function main(): void {
  const db = new AppDatabase();
  const conversation = new ConversationStore(db.getDb());
  conversation.pruneOld();

  const llm = createLLMProvider();
  const bot = createBot(db, llm, conversation);

  console.log("UniBot starting...");
  console.log(`  LLM: ${LLM_ENABLED ? "enabled" : "disabled (command-only mode)"}`);

  const scheduler = new NotificationScheduler(db, bot.api);

  bot.start({
    onStart: () => {
      console.log("UniBot iniciado ✓");
      scheduler.start();
    },
  });
}

main();
