import { Bot, InlineKeyboard, InputFile } from "grammy";
import { config } from "../config";
import {
  CanvasClient, TokenExpiredError, CanvasAPIError,
  routeCommand, type CommandResult,
  telegramFormatter,
  fileIcon,
  resolveContext, setLastCourse,
  type LLMProvider,
} from "@adiutask/core";
import { AppDatabase } from "../db/database";
import { type ConversationStore } from "../db/conversation";

const { formatFolderContents } = telegramFormatter;

const WELCOME_MESSAGE = `👋 ¡Hola! Soy *UniBot*, tu asistente universitario de la UFV.

Puedo ayudarte a consultar tus cursos, tareas, calificaciones, calendario y más desde Canvas LMS.

Para empezar, necesitas vincular tu cuenta de Canvas:
1️⃣ Entra a https://ufv-es.instructure.com
2️⃣ Ve a *Perfil > Configuración > Tokens de acceso*
3️⃣ Genera un nuevo token
4️⃣ Envíamelo con /vincular`;

const HELP_MESSAGE = `📖 *UniBot — Ayuda*

Esto es lo que puedo hacer:

📚 /cursos — Ver tus cursos activos
📝 /tareas — Tareas pendientes
📊 /notas — Calificaciones
📅 /calendario — Próximos eventos
📢 /anuncios — Anuncios recientes
📁 /archivos [curso] — Material del curso

🔗 /vincular — Vincular tu cuenta de Canvas
🗑 /desvincular — Desvincular tu cuenta
🔔 /notificaciones — Activar/desactivar avisos

También puedes escribir directamente:
• "tareas de física"
• "notas de informática"
• "qué hay mañana"`;

const FALLBACK_MESSAGE = `🤔 No entendí tu pregunta. Prueba con:

📚 /cursos — Ver tus cursos
📝 /tareas — Tareas pendientes
📊 /notas — Calificaciones
📅 /calendario — Próximos eventos
📢 /anuncios — Anuncios recientes
📁 /archivos [curso] — Material del curso

También puedes escribir directamente: "tareas de física" o "notas de informática"`;

const LINK_MESSAGE = `⚠️ No tienes tu cuenta de Canvas vinculada.

Necesito tu token para consultar tus datos. Usa /vincular para empezar.`;

const MAX_MESSAGE_LENGTH = 4000;

// Users waiting to provide a token after /vincular
const awaitingToken = new Set<string>();

function truncateMsg(msg: string): string {
  return msg.length > 50 ? msg.slice(0, 50) + "..." : msg;
}

async function sendLongMessage(ctx: { reply: (text: string, opts?: object) => Promise<unknown> }, text: string): Promise<void> {
  if (text.length <= MAX_MESSAGE_LENGTH) {
    await ctx.reply(text, { parse_mode: "Markdown" });
    return;
  }
  let remaining = text;
  let part = 1;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      await ctx.reply(remaining, { parse_mode: "Markdown" });
      console.log(`[BOT] Sent part ${part} (${remaining.length} chars)`);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    if (splitAt <= 0) splitAt = MAX_MESSAGE_LENGTH;
    await ctx.reply(remaining.slice(0, splitAt), { parse_mode: "Markdown" });
    console.log(`[BOT] Sent part ${part} (${splitAt} chars)`);
    remaining = remaining.slice(splitAt).trimStart();
    part++;
  }
}

const TELEGRAM_FILE_LIMIT = 50 * 1024 * 1024; // 50 MB
const FILES_PER_PAGE = 10;

function buildFileKeyboard(
  files: { id: number; name: string; size: number }[],
  folders?: { id: number; name: string; files_count: number; folders_count: number }[],
  page = 1,
  totalPages = 1,
  parentFolderId?: number,
): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Folder buttons first
  if (folders) {
    for (const f of folders) {
      kb.text(`📁 ${f.name}`, `fld:${f.id}`).row();
    }
  }

  // File download buttons
  for (const f of files) {
    kb.text(`📥 ${f.name}`, `dl:${f.id}`).row();
  }

  // Pagination row
  if (totalPages > 1) {
    const folderId = parentFolderId ?? 0;
    if (page > 1) kb.text("◀ Anterior", `pg:${folderId}:${page - 1}`);
    kb.text(`${page}/${totalPages}`, `noop`);
    if (page < totalPages) kb.text("Siguiente ▶", `pg:${folderId}:${page + 1}`);
    kb.row();
  }

  // Back button
  if (parentFolderId !== undefined) {
    kb.text("↩ Volver", `back:${parentFolderId}`).row();
  }

  return kb;
}

function getResultText(result: CommandResult): string {
  return typeof result === "string" ? result : result.text;
}

async function sendCommandResult(
  ctx: { reply: (text: string, opts?: object) => Promise<unknown> },
  result: CommandResult
): Promise<void> {
  if (typeof result === "string") {
    await sendLongMessage(ctx, result);
  } else {
    const hasContent = result.files.length > 0 || (result.folders && result.folders.length > 0);
    if (hasContent) {
      const totalFiles = result.files.length;
      const totalPages = Math.ceil(totalFiles / FILES_PER_PAGE);
      const pageFiles = result.files.slice(0, FILES_PER_PAGE);
      await ctx.reply(result.text, {
        parse_mode: "Markdown",
        reply_markup: buildFileKeyboard(pageFiles, result.folders, 1, totalPages),
      });
    } else {
      await sendLongMessage(ctx, result.text);
    }
  }
}

export function createBot(db: AppDatabase, llm: LLMProvider | null, conversation: ConversationStore): Bot {
  const bot = new Bot(config.telegramBotToken);

  // /start
  bot.command("start", async (ctx) => {
    console.log(`[BOT] /start from user ${ctx.from!.id}`);
    await ctx.reply(WELCOME_MESSAGE, { parse_mode: "Markdown" });
  });

  // /ayuda, /help
  bot.command(["ayuda", "help"], async (ctx) => {
    console.log(`[BOT] /ayuda from user ${ctx.from!.id}`);
    await ctx.reply(HELP_MESSAGE, { parse_mode: "Markdown" });
  });

  // /vincular
  bot.command("vincular", async (ctx) => {
    const telegramId = ctx.from!.id.toString();
    console.log(`[BOT] /vincular from user ${telegramId}`);
    const token = ctx.match?.trim();
    if (token) {
      await handleTokenValidation(ctx, db, token);
    } else {
      awaitingToken.add(telegramId);
      await ctx.reply(
        "🔗 Envíame tu token de Canvas en el siguiente mensaje.\n\n" +
        "Para obtenerlo:\n" +
        "1. Entra a https://ufv-es.instructure.com\n" +
        "2. Ve a *Perfil > Configuración > Tokens de acceso*\n" +
        "3. Genera un nuevo token y pégalo aquí",
        { parse_mode: "Markdown" }
      );
    }
  });

  // /desvincular
  bot.command("desvincular", async (ctx) => {
    const telegramId = ctx.from!.id.toString();
    console.log(`[BOT] /desvincular from user ${telegramId}`);
    const user = db.getUser(telegramId);
    if (!user) {
      await ctx.reply("No tienes ninguna cuenta vinculada.");
      return;
    }
    db.deleteUser(telegramId);
    conversation.clearHistory(telegramId);
    await ctx.reply("✅ Cuenta desvinculada. Tus datos han sido eliminados.");
  });

  // /notificaciones — toggle notifications on/off
  bot.command("notificaciones", async (ctx) => {
    const telegramId = ctx.from!.id.toString();
    console.log(`[BOT] /notificaciones from user ${telegramId}`);
    const user = db.getUser(telegramId);
    if (!user) {
      await ctx.reply(LINK_MESSAGE, { parse_mode: "Markdown" });
      return;
    }
    const currentlyEnabled = db.isNotificationsEnabled(telegramId);
    const newState = !currentlyEnabled;
    db.setNotificationsEnabled(telegramId, newState);
    const emoji = newState ? "🔔" : "🔕";
    const label = newState ? "activadas" : "desactivadas";
    await ctx.reply(
      `${emoji} Notificaciones *${label}*.\n\n` +
      (newState
        ? "Recibirás avisos de entregas próximas, anuncios nuevos y notas actualizadas."
        : "Ya no recibirás notificaciones automáticas."),
      { parse_mode: "Markdown" }
    );
    // Send a test notification when enabling
    if (newState) {
      await ctx.reply(
        "✅ *Notificación de prueba*\n\n" +
        "Si ves este mensaje, las notificaciones funcionan correctamente.",
        { parse_mode: "Markdown" }
      );
    }
  });

  // All text messages
  bot.on("message:text", async (ctx) => {
    const start = Date.now();
    const telegramId = ctx.from!.id.toString();
    const message = ctx.message.text;

    console.log(`[BOT] Message from ${telegramId}: "${truncateMsg(message)}"`);

    // Check if user is providing a token after /vincular
    if (awaitingToken.has(telegramId)) {
      awaitingToken.delete(telegramId);
      await handleTokenValidation(ctx, db, message.trim());
      console.log(`[BOT] Token validation took ${Date.now() - start}ms`);
      return;
    }

    // Check if user has linked account
    const user = db.getUser(telegramId);
    if (!user) {
      console.log(`[BOT] User ${telegramId} not linked, sending link message`);
      await ctx.reply(LINK_MESSAGE, { parse_mode: "Markdown" });
      return;
    }

    const canvas = new CanvasClient(config.canvasApiUrl, user.canvas_token);
    const history = conversation.getHistory(telegramId);

    try {
      // TIER 1: Try command router (fast, no LLM)
      const directResponse = await routeCommand(message, canvas, telegramFormatter, "🔗 Para vincular tu cuenta, usa /vincular y luego envía tu token de Canvas.", "Para desvincular tu cuenta, usa /desvincular");
      if (directResponse) {
        const text = getResultText(directResponse);
        conversation.addMessage(telegramId, "user", message);
        conversation.addMessage(telegramId, "assistant", text);
        await sendCommandResult(ctx, directResponse);
        console.log(`[BOT] Tier 1 response in ${Date.now() - start}ms`);
        return;
      }

      // TIER 2: Context resolver — try to expand follow-ups using history
      if (history.length > 0) {
        const expanded = resolveContext(message, history, telegramId);
        if (expanded) {
          const resolvedResponse = await routeCommand(expanded, canvas, telegramFormatter, "🔗 Para vincular tu cuenta, usa /vincular y luego envía tu token de Canvas.", "Para desvincular tu cuenta, usa /desvincular");
          if (resolvedResponse) {
            const text = getResultText(resolvedResponse);
            conversation.addMessage(telegramId, "user", message);
            conversation.addMessage(telegramId, "assistant", text);
            await sendCommandResult(ctx, resolvedResponse);
            console.log(`[BOT] Tier 2 response in ${Date.now() - start}ms (expanded: "${expanded}")`);
            return;
          }
        }
      }

      // TIER 3: Claude with conversation history
      if (llm) {
        console.log(`[AI] Tier 3 — forwarding to LLM: "${truncateMsg(message)}"`);
        await ctx.replyWithChatAction("typing");
        const typingInterval = setInterval(() => {
          ctx.replyWithChatAction("typing").catch(() => {});
        }, 4000);

        try {
          const llmResponse = await llm.processMessage(message, canvas, history);
          clearInterval(typingInterval);
          conversation.addMessage(telegramId, "user", message);
          conversation.addMessage(telegramId, "assistant", llmResponse);
          await sendLongMessage(ctx, llmResponse);
          console.log(`[BOT] Tier 3 response in ${Date.now() - start}ms`);
        } catch (err) {
          clearInterval(typingInterval);
          throw err;
        }
        return;
      }

      // Fallback — no LLM and unrecognized command
      console.log(`[BOT] Fallback for: "${truncateMsg(message)}"`);
      await ctx.reply(FALLBACK_MESSAGE, { parse_mode: "Markdown" });
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        console.log(`[ERROR] Token expired for user ${telegramId}`);
        await ctx.reply("⚠️ Tu token de Canvas ha expirado. Renuévalo con /vincular");
      } else {
        console.error(`[ERROR] Message handling failed for user ${telegramId}:`, (err as Error).message);
        await ctx.reply("😅 Hubo un error. Inténtalo de nuevo en unos momentos.");
      }
    }
  });

  // Callback handler for file download, folder navigation, and pagination
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const telegramId = ctx.from.id.toString();
    const user = db.getUser(telegramId);

    // Ignore noop buttons (page indicator)
    if (data === "noop") {
      await ctx.answerCallbackQuery();
      return;
    }

    if (!user) {
      await ctx.answerCallbackQuery({ text: "Cuenta no vinculada" });
      return;
    }

    const canvas = new CanvasClient(config.canvasApiUrl, user.canvas_token);

    // --- Folder navigation: fld:{folderId} ---
    if (data.startsWith("fld:")) {
      const folderId = parseInt(data.slice(4), 10);
      if (isNaN(folderId)) {
        await ctx.answerCallbackQuery({ text: "ID inválido" });
        return;
      }

      try {
        await ctx.answerCallbackQuery({ text: "Abriendo carpeta..." });
        const [subfolders, files] = await Promise.all([
          canvas.getFolderSubfolders(folderId),
          canvas.getFolderFiles(folderId),
        ]);

        // Get parent folder info for back button
        const folderInfo = subfolders.length > 0 || files.length > 0
          ? { name: "Carpeta", parentId: undefined as number | undefined }
          : { name: "Carpeta vacía", parentId: undefined as number | undefined };

        // Try to get folder name from subfolders' parent or from the API
        try {
          const allFolderData = await canvas.getFolder(folderId);
          folderInfo.name = allFolderData.name ?? "Carpeta";
          folderInfo.parentId = allFolderData.parent_folder_id ?? undefined;
        } catch {
          // Use default name
        }

        const totalFiles = files.length;
        const totalPages = Math.ceil(totalFiles / FILES_PER_PAGE) || 1;
        const pageFiles = files.slice(0, FILES_PER_PAGE);

        const folderData = subfolders.map((f) => ({
          id: f.id, name: f.name, files_count: f.files_count, folders_count: f.folders_count,
        }));

        const text = formatFolderContents(subfolders, pageFiles, folderInfo.name, 1, totalPages);
        const kb = buildFileKeyboard(
          pageFiles.map((f) => ({ id: f.id, name: f.display_name, size: f.size })),
          folderData.length > 0 ? folderData : undefined,
          1,
          totalPages,
          folderInfo.parentId,
        );

        await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
        console.log(`[BOT] Opened folder ${folderId} for user ${telegramId}`);
      } catch (err) {
        await ctx.answerCallbackQuery().catch(() => {});
        if (err instanceof TokenExpiredError) {
          await ctx.reply("⚠️ Tu token de Canvas ha expirado. Renuévalo con /vincular");
        } else {
          console.error(`[ERROR] Folder navigation failed:`, (err as Error).message);
          await ctx.reply("😅 No se pudo abrir la carpeta. Inténtalo de nuevo.");
        }
      }
      return;
    }

    // --- Pagination: pg:{folderId}:{page} ---
    if (data.startsWith("pg:")) {
      const parts = data.slice(3).split(":");
      const folderId = parseInt(parts[0], 10);
      const page = parseInt(parts[1], 10);
      if (isNaN(folderId) || isNaN(page)) {
        await ctx.answerCallbackQuery({ text: "Datos inválidos" });
        return;
      }

      try {
        await ctx.answerCallbackQuery();
        const files = await canvas.getFolderFiles(folderId);
        const totalPages = Math.ceil(files.length / FILES_PER_PAGE) || 1;
        const start = (page - 1) * FILES_PER_PAGE;
        const pageFiles = files.slice(start, start + FILES_PER_PAGE);

        // Get folder info
        let folderName = "Carpeta";
        let parentId: number | undefined;
        try {
          const folderData = await canvas.getFolder(folderId);
          folderName = folderData.name ?? "Carpeta";
          parentId = folderData.parent_folder_id ?? undefined;
        } catch { /* use defaults */ }

        const text = formatFolderContents([], pageFiles, folderName, page, totalPages);
        const kb = buildFileKeyboard(
          pageFiles.map((f) => ({ id: f.id, name: f.display_name, size: f.size })),
          undefined,
          page,
          totalPages,
          parentId,
        );

        await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
        console.log(`[BOT] Page ${page} of folder ${folderId} for user ${telegramId}`);
      } catch (err) {
        await ctx.answerCallbackQuery().catch(() => {});
        console.error(`[ERROR] Pagination failed:`, (err as Error).message);
        await ctx.reply("😅 Error al cambiar de página.");
      }
      return;
    }

    // --- Back navigation: back:{parentFolderId} ---
    if (data.startsWith("back:")) {
      const parentFolderId = parseInt(data.slice(5), 10);
      if (isNaN(parentFolderId)) {
        await ctx.answerCallbackQuery({ text: "ID inválido" });
        return;
      }

      try {
        await ctx.answerCallbackQuery({ text: "Volviendo..." });
        const [subfolders, files] = await Promise.all([
          canvas.getFolderSubfolders(parentFolderId),
          canvas.getFolderFiles(parentFolderId),
        ]);

        let folderName = "Carpeta";
        let grandparentId: number | undefined;
        try {
          const folderData = await canvas.getFolder(parentFolderId);
          folderName = folderData.name ?? "Carpeta";
          grandparentId = folderData.parent_folder_id ?? undefined;
        } catch { /* use defaults */ }

        const totalPages = Math.ceil(files.length / FILES_PER_PAGE) || 1;
        const pageFiles = files.slice(0, FILES_PER_PAGE);

        const folderData = subfolders.map((f) => ({
          id: f.id, name: f.name, files_count: f.files_count, folders_count: f.folders_count,
        }));

        const text = formatFolderContents(subfolders, pageFiles, folderName, 1, totalPages);
        const kb = buildFileKeyboard(
          pageFiles.map((f) => ({ id: f.id, name: f.display_name, size: f.size })),
          folderData.length > 0 ? folderData : undefined,
          1,
          totalPages,
          grandparentId,
        );

        await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
        console.log(`[BOT] Back to folder ${parentFolderId} for user ${telegramId}`);
      } catch (err) {
        await ctx.answerCallbackQuery().catch(() => {});
        if (err instanceof TokenExpiredError) {
          await ctx.reply("⚠️ Tu token de Canvas ha expirado. Renuévalo con /vincular");
        } else {
          console.error(`[ERROR] Back navigation failed:`, (err as Error).message);
          await ctx.reply("😅 No se pudo volver a la carpeta anterior.");
        }
      }
      return;
    }

    // --- File download: dl:{fileId} ---
    if (!data.startsWith("dl:")) return;

    const fileId = parseInt(data.slice(3), 10);
    if (isNaN(fileId)) {
      await ctx.answerCallbackQuery({ text: "ID de archivo inválido" });
      return;
    }

    try {
      // Check file size first
      const file = await canvas.getFile(fileId);
      if (file.size > TELEGRAM_FILE_LIMIT) {
        await ctx.answerCallbackQuery();
        await ctx.reply(
          `⚠️ El archivo *${file.display_name}* pesa ${(file.size / (1024 * 1024)).toFixed(1)} MB y supera el límite de 50 MB de Telegram.`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      await ctx.answerCallbackQuery({ text: "Descargando..." });
      await ctx.replyWithChatAction("upload_document");

      console.log(`[BOT] Downloading file ${fileId} (${file.display_name}) for user ${telegramId}`);
      const { buffer, name } = await canvas.downloadFile(fileId, file);

      await ctx.replyWithDocument(new InputFile(Buffer.from(buffer), name));
      console.log(`[BOT] File ${fileId} sent to user ${telegramId}`);
    } catch (err) {
      await ctx.answerCallbackQuery().catch(() => {});
      if (err instanceof TokenExpiredError) {
        await ctx.reply("⚠️ Tu token de Canvas ha expirado. Renuévalo con /vincular");
      } else if (err instanceof CanvasAPIError && err.status === 403) {
        await ctx.reply("🔒 No tienes permiso para descargar este archivo.");
      } else {
        console.error(`[ERROR] File download failed for user ${telegramId}:`, (err as Error).message);
        await ctx.reply("😅 No se pudo descargar el archivo. Inténtalo de nuevo.");
      }
    }
  });

  return bot;
}

async function handleTokenValidation(
  ctx: { reply: (text: string, opts?: object) => Promise<unknown>; from?: { id: number } },
  db: AppDatabase,
  token: string
): Promise<void> {
  const telegramId = ctx.from!.id.toString();
  console.log(`[BOT] Validating token for user ${telegramId}`);
  const canvas = new CanvasClient(config.canvasApiUrl, token);
  try {
    const profile = await canvas.validateToken();
    db.saveUser(telegramId, token, profile.id, profile.name);
    console.log(`[BOT] User ${telegramId} linked successfully`);
    await ctx.reply(
      `✅ ¡Cuenta vinculada!\n\nBienvenido/a, *${profile.name}* 👋\nYa puedes usar /cursos, /tareas, /notas y más.`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      console.log(`[ERROR] Invalid token for user ${telegramId}`);
      await ctx.reply("❌ El token no es válido. Verifica que lo copiaste correctamente.");
    } else {
      console.error(`[ERROR] Token validation failed for user ${telegramId}:`, (err as Error).message);
      await ctx.reply("❌ Error al validar el token. Inténtalo de nuevo.");
    }
  }
}
