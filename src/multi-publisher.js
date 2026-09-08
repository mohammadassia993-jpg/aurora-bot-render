/**
 * multi-publisher.js — Multi-Platform Publisher
 *
 * Publishes approved products to all platforms:
 * - Payhip (primary)
 * - Gumroad (secondary)
 * - Telegram Stars (Arabic audience)
 * - Etsy (activating)
 * - Zaher (Arabic platform)
 * - Sellfy (alternative)
 * - Auto-discovered platforms
 *
 * Flow: Approval → Auto-publish to all platforms simultaneously
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { callModel } from './ai.js';
import { config } from './config.js';
import { sendMessageDetailed } from './telegram.js';
import { info, warn } from './logger.js';
import { eventBus, EVENTS } from './event-bus.js';
import { EpisodicMemory, SemanticMemory } from './persistent-memory.js';

// ── Platform Registry ──
const PLATFORMS = {
  payhip: {
    name: 'Payhip',
    url: 'https://payhip.com',
    type: 'primary',
    apiAvailable: false,
    method: 'manual_or_api',
    currency: 'USD',
    notes: 'المنصة الرئيسية — لا رسوم شهرية'
  },
  gumroad: {
    name: 'Gumroad',
    url: 'https://gumroad.com',
    type: 'secondary',
    apiAvailable: false,
    method: 'manual_or_api',
    currency: 'USD',
    notes: 'المنصة الثانوية — سهلة الاستخدام'
  },
  telegram_stars: {
    name: 'Telegram Stars',
    url: 'https://t.me',
    type: 'arabic',
    apiAvailable: true,
    method: 'bot_api',
    currency: 'Stars',
    notes: 'للجمهور العربي — عبر البوت مباشرة'
  },
  etsy: {
    name: 'Etsy',
    url: 'https://etsy.com',
    type: 'marketplace',
    apiAvailable: true,
    method: 'api',
    currency: 'USD',
    notes: 'منصة marketplace — مناسبة للمنتجات الرقمية'
  },
  zaher: {
    name: 'Zaher',
    url: 'https://zaher.com',
    type: 'arabic',
    apiAvailable: false,
    method: 'manual',
    currency: 'SAR',
    notes: 'منصة عربية — بيع رقمي'
  },
  sellfy: {
    name: 'Sellfy',
    url: 'https://sellfy.com',
    type: 'alternative',
    apiAvailable: true,
    method: 'api',
    currency: 'USD',
    notes: 'بديل — دعم API جيد'
  }
};

/** Publish product to a specific platform */
async function publishToPlatform(product, platformKey) {
  const platform = PLATFORMS[platformKey];
  if (!platform) {
    warn('publisher', `Unknown platform: ${platformKey}`);
    return { success: false, error: 'unknown_platform' };
  }

  info('publisher', `📤 Publishing "${product.title}" to ${platform.name}...`);

  try {
    if (platformKey === 'telegram_stars') {
      // Telegram Stars: send via bot with payment link
      const msg = [
        `🛒 **${product.title}**`,
        '',
        product.description,
        '',
        `💰 السعر: ${product.price} نجمة Telegram`,
        `📁 النوع: ${product.format}`,
        '',
        `للشراء، أرسل: اشتري ${product.title}`
      ].join('\n');
      await sendMessageDetailed(msg, config.telegramChatId);
      return { success: true, platform: platform.name, method: 'telegram_bot' };
    }

    if (platformKey === 'payhip' || platformKey === 'gumroad') {
      // Store publishing record in DB for manual/API publishing
      db.prepare(`
        INSERT INTO outbox(channel, recipient, subject, body, status)
        VALUES (?, 'public', ?, ?, 'queued')
      `).run(platform.name, `PUB:${product.title}`, JSON.stringify({
        platform: platformKey,
        product: product.title,
        price: product.price,
        description: product.description
      }));

      return { success: true, platform: platform.name, method: 'queued' };
    }

    if (platform.apiAvailable) {
      // For platforms with API: record for API publishing
      db.prepare(`
        INSERT INTO outbox(channel, recipient, subject, body, status)
        VALUES (?, 'public', ?, ?, 'queued')
      `).run(platform.name, `API:${product.title}`, JSON.stringify({
        platform: platformKey,
        product: product.title,
        price: product.price,
        action: 'api_publish'
      }));

      return { success: true, platform: platform.name, method: 'api_queued' };
    }

    // Default: queue for manual publishing
    db.prepare(`
      INSERT INTO outbox(channel, recipient, subject, body, status)
      VALUES (?, 'public', ?, ?, 'queued')
    `).run(platform.name, `MANUAL:${product.title}`, JSON.stringify({
      platform: platformKey,
      product: product.title,
      action: 'manual_publish'
    }));

    return { success: true, platform: platform.name, method: 'manual_queued' };
  } catch (e) {
    warn('publisher', `Failed to publish to ${platform.name}: ${e.message}`);
    return { success: false, platform: platform.name, error: e.message };
  }
}

/** Publish to all platforms simultaneously */
export async function publishToAllPlatforms(product) {
  info('publisher', `🚀 Publishing "${product.title}" to all platforms...`);

  const results = {};
  const platformKeys = Object.keys(PLATFORMS);

  for (const key of platformKeys) {
    results[key] = await publishToPlatform(product, key);
  }

  const successCount = Object.values(results).filter(r => r.success).length;
  const failCount = Object.values(results).filter(r => !r.success).length;

  info('publisher', `✅ Published to ${successCount}/${platformKeys.length} platforms (${failCount} failed)`);

  // Record in memory
  EpisodicMemory.record('product_published', 'publisher', null, product.title, `Published to ${successCount} platforms`, 'success', results);

  // Generate marketing content
  await generateMarketingContent(product);

  return results;
}

/** Generate marketing post for each published product */
async function generateMarketingContent(product) {
  const prompt = `أنشئ منشوراً تسويقياً قصيراً بالعربية لمنتج رقمي:

العنوان: ${product.title}
الوصف: ${product.description}
السعر: $${product.price}

المطلوب: منشور تسويقي جذاب (3-5 أسطر) مناسب لـ Telegram وTwitter.
- لا تستخدم JSON.
- اكتب نصاً عربياً طبيعياً.`;

  try {
    const marketing = await callModel('publisher', prompt);
    const clean = String(marketing).trim();

    if (clean.length > 20) {
      // Save marketing content
      const marketingFile = path.join(path.dirname(product.filepath || ''), `marketing_${product.id}.txt`);
      fs.writeFileSync(marketingFile, clean, 'utf8');

      // Queue for Telegram channel publishing
      db.prepare(`
        INSERT INTO outbox(channel, recipient, subject, body, status)
        VALUES ('telegram_channel', 'public', ?, ?, 'queued')
      `).run(`MARKETING:${product.title}`, clean);

      info('publisher', `📝 Marketing content generated for: ${product.title}`);
    }
  } catch (e) {
    warn('publisher', `Marketing generation failed: ${e.message}`);
  }
}

/** Get all registered platforms */
export function getPlatforms() {
  return Object.entries(PLATFORMS).map(([key, p]) => ({
    key,
    ...p,
    published: db.prepare("SELECT COUNT(*) c FROM outbox WHERE channel = ? AND subject LIKE 'PUB:%'").get(p.name)?.c || 0
  }));
}

/** Register a new discovered platform */
export function registerPlatform(key, platformData) {
  PLATFORMS[key] = {
    name: platformData.name,
    url: platformData.url,
    type: platformData.type || 'discovered',
    apiAvailable: platformData.apiAvailable || false,
    method: platformData.method || 'manual',
    currency: platformData.currency || 'USD',
    notes: platformData.notes || 'Newly discovered platform'
  };
  info('publisher', `🆕 Platform registered: ${platformData.name} (${key})`);
  SemanticMemory.store('platforms', key, JSON.stringify(platformData), 0.8);
}

/** Get publisher stats */
export function getPublisherStats() {
  const published = db.prepare("SELECT channel, COUNT(*) c FROM outbox WHERE status = 'queued' GROUP BY channel").all();
  return {
    platforms: Object.keys(PLATFORMS).length,
    queued: published.reduce((s, r) => s + r.c, 0),
    byPlatform: published
  };
}

export default { publishToAllPlatforms, getPlatforms, registerPlatform, getPublisherStats };
