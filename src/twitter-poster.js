/**
 * twitter-poster.js — Auto-post to Twitter via Shizuku Android automation
 * Falls back to queue if Shizuku not available
 */
import { db } from './db.js';
import { info, warn } from './logger.js';
import { config } from './config.js';

export async function postToTwitter(text) {
  // Try Shizuku first
  try {
    const { execSync } = await import('node:child_process');
    const safeText = text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    execSync(`shizuku_cmd am start -a android.intent.action.SENDTO -d "twitter://post?message=${safeText}"`, { timeout: 10000 });
    info('twitter', '✅ Posted via Shizuku');
    db.prepare("INSERT INTO outbox(channel, recipient, subject, body, status) VALUES ('twitter', 'public', ?, ?, 'sent')").run('POST:' + text.slice(0, 40), text);
    return true;
  } catch (e) { /* Shizuku not available */ }

  // Queue for later
  db.prepare("INSERT INTO outbox(channel, recipient, subject, body, status) VALUES ('twitter', 'public', ?, ?, 'queued')").run('POST:' + text.slice(0, 40), text);
  info('twitter', '📤 Queued for Twitter (Shizuku unavailable)');
  return false;
}

export async function postMarketingToTwitter(product) {
  const text = `🛒 ${product.name}\n\n${product.description}\n\n💰 $${product.price} | USDT/USDC\n📦 تسليم فوري\n\n💬 للشراء: اكتب "اشتري ${product.name}"\n\n#Web3 #DePIN #区块链 #_crypto`;
  return postToTwitter(text);
}

export default { postToTwitter, postMarketingToTwitter };
