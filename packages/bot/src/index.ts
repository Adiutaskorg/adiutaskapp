import { LLM_ENABLED } from "./config";
import { createBot } from "./bot/telegram";
import { AppDatabase } from "./db/database";
import { ConversationStore } from "./db/conversation";
import { createLLMProvider } from "@adiutask/core";
import { NotificationScheduler } from "./scheduler/notifications";

function main(): void {
  const db = new AppDatabase();
  const conversation = new ConversationStore(db.getDb());
  conversation.pruneOld();

  const llm = createLLMProvider(
    undefined,
    2048,
    `- Usa *negrita* para énfasis (NO uses **doble asterisco**).
- Usa _cursiva_ para nombres de cursos o detalles secundarios.
- Usa emojis como viñetas (📚, ✅, 📅, etc.).
- NO uses markdown de enlaces \`[texto](url)\` a menos que sea un enlace real.
- Escapa los caracteres especiales de MarkdownV2 si aparecen en datos: . - ( ) ! > #`,
    'Si el usuario no tiene cuenta vinculada, guíale para hacerlo con /vincular.',
  );
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
