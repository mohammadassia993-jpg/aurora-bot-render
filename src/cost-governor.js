// cost-governor.js — تتبع استهلاك مزودي AI
import { db } from './db.js';

const DAILY_LIMITS = {
  zai: 1000,
  llm7: 500,
  huggingface: 50
};

const WARN_AT = 0.8;
const CRITICAL_AT = 0.95;

db.exec(`
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  success INTEGER DEFAULT 1,
  error_message TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider_date ON ai_usage(provider, created_at DESC);
`);

export function recordUsage(provider, model, success, errorMessage = '') {
  try {
    db.prepare(`INSERT INTO ai_usage(provider, model, success, error_message) VALUES (?, ?, ?, ?)`)
      .run(String(provider), String(model).slice(0,100), success ? 1 : 0, String(errorMessage || '').slice(0, 300));
  } catch (e) {
    console.error('[cost-governor] record failed:', e.message);
  }
}

export function getTodayStats() {
  const rows = db.prepare(`
    SELECT provider,
           COUNT(*) AS total,
           SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) AS ok,
           SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) AS fail
    FROM ai_usage
    WHERE created_at >= datetime('now', '-24 hours')
    GROUP BY provider
  `).all();

  const stats = {};
  for (const p of Object.keys(DAILY_LIMITS)) {
    stats[p] = { total: 0, ok: 0, fail: 0, limit: DAILY_LIMITS[p], percent: 0 };
  }
  for (const r of rows) {
    stats[r.provider] = {
      total: r.total,
      ok: r.ok,
      fail: r.fail,
      limit: DAILY_LIMITS[r.provider] || null,
      percent: DAILY_LIMITS[r.provider] ? Math.round((r.total / DAILY_LIMITS[r.provider]) * 100) : null
    };
  }
  return stats;
}

export function checkLimit(provider) {
  const s = getTodayStats()[provider];
  if (!s || !s.limit) return { ok: true, level: 'unknown' };
  const ratio = s.total / s.limit;
  if (ratio >= CRITICAL_AT) return { ok: false, level: 'critical', used: s.total, limit: s.limit };
  if (ratio >= WARN_AT) return { ok: true, level: 'warn', used: s.total, limit: s.limit };
  return { ok: true, level: 'ok', used: s.total, limit: s.limit };
}

export function formatReport() {
  const stats = getTodayStats();
  const lines = ['📊 استهلاك AI (24 ساعة):', ''];
  for (const [provider, s] of Object.entries(stats)) {
    const pct = s.limit ? ` (${s.percent}%)` : '';
    const icon = s.limit && s.percent >= 80 ? '⚠️' : '✅';
    lines.push(`${icon} ${provider}: ${s.total}/${s.limit || '?'}${pct} — نجاح ${s.ok} / فشل ${s.fail}`);
  }
  return lines.join('\n');
}
