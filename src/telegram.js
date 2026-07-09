import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS } from './config.js';
import { error as logError } from './log.js';

async function sendToChat(chatId, text) {
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
  );
  const body = await res.json();
  if (!res.ok || !body.ok) {
    throw new Error(
      `Telegram sendMessage failed for chat ${chatId}: HTTP ${res.status} — ${body.description ?? 'no description'}`,
    );
  }
}

export async function sendMessage(text) {
  const errors = [];
  for (const chatId of TELEGRAM_CHAT_IDS) {
    try {
      await sendToChat(chatId, text);
    } catch (err) {
      logError(err.message);
      errors.push(err);
    }
  }
  // If ALL destinations failed, throw so callers (e.g. startup message) know.
  if (errors.length === TELEGRAM_CHAT_IDS.length && errors.length > 0) {
    throw errors[0];
  }
}
