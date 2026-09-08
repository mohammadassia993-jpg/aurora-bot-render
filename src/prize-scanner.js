/**
 * prize-scanner.js — Competition & Prize Scanner (Hourly)
 *
 * Scans for:
 * - Web3 bounties (Gitcoin, Dework, Bountycaster, Layer3)
 * - Hackathons (Solana, Ethereum, etc.)
 * - Content competitions
 * - Grants and funding
 *
 * Auto-registers for all discovered opportunities
 * Tracks status: pending, applied, won, rejected
 */
import { db } from './db.js';
import { callModel } from './ai.js';
import { config } from './config.js';
import { sendMessageDetailed } from './telegram.js';
import { info, warn } from './logger.js';
import { eventBus, EVENTS } from './event-bus.js';
import { EpisodicMemory, SemanticMemory } from './persistent-memory.js';

// ── Prizes/competitions table ──
db.exec(`
CREATE TABLE IF NOT EXISTS prizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bounty',
  prize_amount TEXT DEFAULT '',
  deadline TEXT DEFAULT '',
  url TEXT DEFAULT '',
  status TEXT DEFAULT 'discovered',
  applied_at TEXT,
  result TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

/** Main hourly scan */
export async function scanPrizes() {
  info('prize-scanner', '🏆 Starting hourly prize scan...');

  const existingTitles = new Set(
    db.prepare('SELECT title FROM prizes').all().map(r => r.title)
  );

  const prompt = `ابحث عن مسابقات وجوائز و bounty نشطة حالياً في مجالات Web3 و AI و blockchain.

المصادر المطلوب فحصها:
- Gitcoin bounties
- Dework tasks
- Bountycaster
- Layer3 quests
- Superteam bounties
- Hackathon events
- Content competitions
- Grants programs

المطلوب: أعطِ 5-10 نتائج كـ JSON:
{"prizes": [{"title": "...", "platform": "...", "type": "bounty|hackathon|grant|competition", "prize": "...", "deadline": "...", "url": "..."}]}

ركّز على الفرص المتاحة للعمل عن بُعد وال הבלוגاء/Web3 content.`;

  try {
    const response = await callModel('scout', prompt);
    const clean = String(response).replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*"prizes"[\s\S]*\}/);

    if (!jsonMatch) {
      warn('prize-scanner', 'No JSON response from AI');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const prizes = parsed.prizes || [];
    let newCount = 0;

    for (const prize of prizes) {
      if (existingTitles.has(prize.title)) {
        info('prize-scanner', `⏭ Already tracked: ${prize.title.slice(0, 40)}`);
        continue;
      }

      // Register in database
      db.prepare(`
        INSERT INTO prizes(title, platform, type, prize_amount, deadline, url, status)
        VALUES (?, ?, ?, ?, ?, ?, 'discovered')
      `).run(
        prize.title,
        prize.platform || 'unknown',
        prize.type || 'bounty',
        prize.prize || '',
        prize.deadline || '',
        prize.url || ''
      );

      newCount++;
      info('prize-scanner', `🆕 New prize: ${prize.title.slice(0, 40)} on ${prize.platform}`);

      // Auto-register (create task for submission)
      db.prepare(`
        INSERT INTO tasks(source, title, reward, status, payload_json)
        VALUES ('prize_scan', ?, 0, 'discovered', ?)
      `).run(
        `Compete: ${prize.title}`,
        JSON.stringify({ prize: prize.title, platform: prize.platform, type: prize.type, url: prize.url })
      );
    }

    if (newCount > 0) {
      // Fire event
      await eventBus.fire(EVENTS.OPPORTUNITY_DISCOVERED, {
        count: newCount,
        source: 'prize_scanner',
        prizes: prizes.slice(0, 5).map(p => p.title)
      });

      // Record in memory
      EpisodicMemory.record('prize_scan', 'prize_scanner', null, `Found ${newCount} new prizes`, prizes.map(p => `${p.title} (${p.platform})`).join(', '), 'success');
    }

    info('prize-scanner', `✅ Scan complete: ${newCount} new prizes found`);
    return prizes;
  } catch (e) {
    warn('prize-scanner', `Scan failed: ${e.message}`);
    return [];
  }
}

/** Get all tracked prizes */
export function getPrizes(status = null, limit = 20) {
  if (status) {
    return db.prepare('SELECT * FROM prizes WHERE status = ? ORDER BY created_at DESC LIMIT ?').all(status, limit);
  }
  return db.prepare('SELECT * FROM prizes ORDER BY created_at DESC LIMIT ?').all(limit);
}

/** Update prize status */
export function updatePrizeStatus(prizeId, status, result = '') {
  db.prepare('UPDATE prizes SET status = ?, result = ?, applied_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, result, prizeId);
  info('prize-scanner', `Prize #${prizeId} status → ${status}`);
}

/** Get scanner stats */
export function getPrizeStats() {
  const total = db.prepare('SELECT COUNT(*) c FROM prizes').get().c;
  const discovered = db.prepare("SELECT COUNT(*) c FROM prizes WHERE status = 'discovered'").get().c;
  const applied = db.prepare("SELECT COUNT(*) c FROM prizes WHERE status = 'applied'").get().c;
  const won = db.prepare("SELECT COUNT(*) c FROM prizes WHERE status = 'won'").get().c;

  return { total, discovered, applied, won };
}

export default { scanPrizes, getPrizes, updatePrizeStatus, getPrizeStats };
