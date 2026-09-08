/**
 * platform-discovery.js — New Selling Platform Discovery
 *
 * Continuously discovers new digital product selling platforms:
 * - Arabic and international
 * - Must support API or self-serve
 * - No credit card required
 * - Targeted audience
 *
 * Auto-registers accounts and links to system
 */
import { db } from './db.js';
import { callModel } from './ai.js';
import { info, warn } from './logger.js';
import { eventBus, EVENTS } from './event-bus.js';
import { EpisodicMemory, SemanticMemory } from './persistent-memory.js';

// ── Discovered platforms table ──
db.exec(`
CREATE TABLE IF NOT EXISTS discovered_platforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT DEFAULT 'digital_marketplace',
  api_available INTEGER DEFAULT 0,
  credit_card_required INTEGER DEFAULT 0,
  language TEXT DEFAULT 'en',
  notes TEXT DEFAULT '',
  registered INTEGER DEFAULT 0,
  linked INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

/** Scan for new selling platforms */
export async function discoverPlatforms() {
  info('platform-discovery', '🔍 Scanning for new selling platforms...');

  const existingUrls = new Set(
    db.prepare('SELECT url FROM discovered_platforms').all().map(r => r.url)
  );

  const prompt = `ابحث عن منصات بيع رقمية جديدة (عربية وعالمية) تفي بالمعايير:
1. تدعم API أو بيع ذاتي (self-serve)
2. لا تطلب بطاقة ائتمان للتسجيل
3. لها جمهور مستهدف في مجال Web3 أو المنتجات الرقمية
4. رسوم معقولة

المعروفة بالفعل (لا تذكرها): Payhip, Gumroad, Etsy, Sellfy, Zaher, Lemonsqueezy, Sellix

المطلوب: 3-5 منصات جديدة كـ JSON:
{"platforms": [{"name": "...", "url": "...", "type": "...", "api": true/false, "credit_card": true/false, "language": "ar/en", "notes": "..."}]}`;

  try {
    const response = await callModel('scout', prompt);
    const clean = String(response).replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*"platforms"[\s\S]*\}/);

    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const platforms = parsed.platforms || [];
    let newCount = 0;

    for (const p of platforms) {
      if (existingUrls.has(p.url)) continue;

      db.prepare(`
        INSERT INTO discovered_platforms(name, url, type, api_available, credit_card_required, language, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        p.name,
        p.url,
        p.type || 'digital_marketplace',
        p.api ? 1 : 0,
        p.credit_card ? 1 : 0,
        p.language || 'en',
        p.notes || ''
      );

      newCount++;
      info('platform-discovery', `🆕 New platform: ${p.name} (${p.url})`);

      // Register in semantic memory
      SemanticMemory.store('platforms', p.name, JSON.stringify(p), 0.8);
    }

    if (newCount > 0) {
      await eventBus.fire(EVENTS.OPPORTUNITY_DISCOVERED, {
        count: newCount,
        source: 'platform_discovery',
        platforms: platforms.map(p => p.name)
      });

      EpisodicMemory.record('platform_discovery', 'platform-discovery', null, `Found ${newCount} new platforms`, platforms.map(p => p.name).join(', '), 'success');
    }

    info('platform-discovery', `✅ Scan complete: ${newCount} new platforms`);
    return platforms;
  } catch (e) {
    warn('platform-discovery', `Scan failed: ${e.message}`);
    return [];
  }
}

/** Get all discovered platforms */
export function getDiscoveredPlatforms() {
  return db.prepare('SELECT * FROM discovered_platforms ORDER BY created_at DESC').all();
}

/** Get platform discovery stats */
export function getDiscoveryStats() {
  const total = db.prepare('SELECT COUNT(*) c FROM discovered_platforms').get().c;
  const registered = db.prepare('SELECT COUNT(*) c FROM discovered_platforms WHERE registered = 1').get().c;
  return { total, registered };
}

export default { discoverPlatforms, getDiscoveredPlatforms, getDiscoveryStats };
