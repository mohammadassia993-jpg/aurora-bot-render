// helper-notify.js — bot notification helper (avoids circular imports)
import { config } from './config.js';
export async function notifyBot(text) {
  try {
    const { telegramRequest } = await import('./telegram-api.js');
    if (!config.telegramToken || !config.telegramChatId) return;
    await telegramRequest(config.telegramToken, 'sendMessage', {
      chat_id: config.telegramChatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }
    }, 15000);
  } catch {}
}
