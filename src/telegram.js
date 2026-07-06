import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from './config.js';

export async function sendMessage(text) {
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    },
  );
  const body = await res.json();
  if (!res.ok || !body.ok) {
    throw new Error(
      `Telegram sendMessage failed: HTTP ${res.status} — ${body.description ?? 'no description'}`,
    );
  }
}
