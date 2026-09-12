/**
 * marketing-engine.js — Comprehensive Marketing Engine
 *
 * Auto-generates marketing posts (via Pomelli/AI) and publishes to:
 * - Telegram channel (@SilentGiants_Store)
 * - Twitter (@SilentGiants_Web3)
 * - Telegram groups, Reddit, LinkedIn
 *
 * Marketing focuses on: 6 store products, 92 tasks as sellable products,
 * special offers, bundles.
 */
import { db } from './db.js';
import { config } from './config.js';
import { callModel } from './ai.js';
import { sendMessageDetailed } from './telegram.js';
import { info, warn } from './logger.js';
import { eventBus, EVENTS } from './event-bus.js';
import { EpisodicMemory, SemanticMemory } from './persistent-memory.js';
import { PRODUCTS } from './storefront.js';

let postsPublished = 0;

/** Generate a marketing post using AI */
async function generatePost(topic, product) {
  const prompt = `أنت خبير تسويق في Web3 وتقنية بلوكتشين. أنشئ منشوراً تسويقياً جذاباً بالعربية.

الموضوع: ${topic}
المنتج: ${product.title}
الوصف: ${product.description}
السعر: \$${product.price}

أسلوب الفريق: احترافي، واثق، دافئ، مباشر. لا مبالغة ولا وعود فارغة.

المطلوب: منشور تسويقي (3-5 أسطر) بعلامات الترقيم العربية، وجذاب للفئة المستهدفة. لا تستخدم JSON أو أكواد. أضف في النهاية: "للحصول على الحزمة الكاملة تواصل معنا 🚀"`;

  try {
    const resp = await callModel('marketing', prompt);
    const text = String(resp).trim();
    if (text.length > 30) return text;
  } catch (e) { warn('marketing', `Post generation failed: ${e.message}`); }
  return null;
}

/** Publish to Telegram channel */
async function publishToTelegram(post) {
  const channelId = config.telegramChannelId;
  if (!channelId) { warn('marketing', 'TELEGRAM_CHANNEL_ID not configured — skipping channel publish'); return false; }
  try {
    await sendMessageDetailed(post, channelId);
    info('marketing', '📣 Post published to Telegram channel');
    return true;
  } catch (e) {
    warn('marketing', `Telegram publish failed: ${e.message}`);
    return false;
  }
}

/** Queue post for Twitter/Reddit/LinkedIn outbox */
function queueExternalPost(post, platform) {
  db.prepare(`
    INSERT INTO outbox(channel, recipient, subject, body, status)
    VALUES (?, 'public', ?, ?, 'queued')
  `).run(platform, `MARKETING:${post.slice(0, 40)}`, post);
  info('marketing', `📤 Queued post for ${platform}`);
}

/** Run one full marketing cycle */
export async function runMarketingCycle() {
  info('marketing', '🚀 Starting marketing cycle...');

  // Skip if exhausted today (limit to avoid spam)
  const todayPosts = db.prepare("SELECT COUNT(*) c FROM outbox WHERE date(created_at) = date('now') AND subject LIKE 'MARKETING:%'").get().c;
  if (todayPosts >= 15) {
    info('marketing', `⏭ Already published ${todayPosts} posts today (limit 15)`);
    return { posts: todayPosts, skipped: true };
  }

  let published = 0;
  const products = PRODUCTS || [];

  // Market each product
  for (const product of products) {
    if (todayPosts + published >= 15) break;

    const post = await generatePost('عرض المنتج والتسويق له', product);
    if (post) {
      // Telegram channel
      await publishToTelegram(post);

      // Queue for external platforms
      queueExternalPost(post, 'twitter');
      queueExternalPost(post, 'reddit');
      queueExternalPost(post, 'linkedin');

      published++;
      postsPublished++;
      info('marketing', `✅ Marketed: ${product.name} (${published} this cycle)`);
    }
  }

  // Market 92-tasks bundle if no individual products
  if (products.length === 0) {
    const bundle = {
      title: 'حزمة محتوى Web3 الشاملة (92 مهمة)',
      description: 'حزمة كاملة من 92 مهمة Web3 قابلة للبيع المتكرر: 5 مقالات + 3 ترجمات + تقرير أسبوعي',
      price: 500
    };
    const post = await generatePost('عرض الحزمة الشاملة', bundle);
    if (post) {
      await publishToTelegram(post);
      queueExternalPost(post, 'twitter');
      queueExternalPost(post, 'reddit');
      published++;
    }
  }

  // Record in memory
  if (published > 0) {
    EpisodicMemory.record('marketing_cycle', 'marketing', null, `Published ${published} marketing posts`, 'Successfully marketed products', 'success');
    await eventBus.fire(EVENTS.PRODUCT_PUBLISHED, { count: published, source: 'marketing_engine' });
  }

  info('marketing', `✅ Marketing cycle complete: ${published} posts published`);
  return { posts: published };
}

/** Generate and queue a single special offer post */
export async function publishSpecialOffer(offer) {
  const prompt = `أنشئ منشوراً تسويقياً عن عرض خاص:

العرض: ${offer.title}
التفاصيل: ${offer.details || offer.description || ''}
السعر: ${offer.price ? \`\$${offer.price}\` : 'يحدد لاحقاً'}

اكتب منشوراً جذاباً بالعربية (3-4 أسطر). لا JSON.`;

  try {
    const resp = await callModel('marketing', prompt);
    const post = String(resp).trim();
    if (post.length > 30) {
      await publishToTelegram(post);
      queueExternalPost(post, 'twitter');
      return { success: true, length: post.length };
    }
  } catch (e) { warn('marketing', `Special offer failed: ${e.message}`); }
  return { success: false };
}

/** Get marketing stats */
export function getMarketingStats() {
  const total = db.prepare("SELECT COUNT(*) c FROM outbox WHERE subject LIKE 'MARKETING:%'").get().c;
  const today = db.prepare("SELECT COUNT(*) c FROM outbox WHERE subject LIKE 'MARKETING:%' AND date(created_at) = date('now')").get().c;
  return { totalPosts: total, postsToday: today, postsPublished };
}

export default { runMarketingCycle, publishSpecialOffer, getMarketingStats };
