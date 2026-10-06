// bounty-scout.js — Discovers paid bounties from multiple sources
import { db } from './db.js';
import { callModel } from './ai.js';
import { info, warn, error } from './logger.js';

const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DAILY_REPORT_HOUR = 12;
const INITIAL_DELAY_MS = 3 * 60 * 1000;
const ALERT_MIN_SCORE = 7;
const AI_CALL_DELAY_MS = 3000;
const MAX_ANALYZE = 8;
const MAX_ALERTS = 5;

db.exec(`CREATE TABLE IF NOT EXISTS bounty_findings (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, title TEXT NOT NULL, url TEXT DEFAULT "", reward TEXT DEFAULT "", description TEXT DEFAULT "", relevance_score REAL DEFAULT 0, relevance_reason TEXT DEFAULT "", actionable INTEGER DEFAULT 0, seen_at TEXT DEFAULT CURRENT_TIMESTAMP)`);

let lastDailyReportDay = null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sendToTelegram(text) {
  try {
    const mod = await import('./telegram.js');
    if (typeof mod.sendMessageDetailed === 'function') { await mod.sendMessageDetailed(text); return true; }
  } catch (e) { warn('bounty-scout', 'telegram failed: ' + e.message); }
  return false;
}

async function fetchSuperteamEarn() {
  try {
    const res = await fetch('https://earn.superteam.fun/api/listings/?take=20', { headers: { 'User-Agent': 'SG/1.0' } });
    if (!res.ok) { warn('bounty-scout', 'superteam HTTP ' + res.status); return []; }
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.listings || data.data || []);
    return items.map(function(x) {
      return {
        source: 'Superteam Earn',
        title: String(x.title || x.name || '').slice(0, 200),
        url: 'https://earn.superteam.fun/listing/' + (x.slug || x.id || ''),
        reward: String(x.rewardAmount || x.usdValue || x.reward || ''),
        description: String(x.description || x.shortDescription || '').slice(0, 300)
      };
    }).filter(function(x) { return x.title; });
  } catch (e) { warn('bounty-scout', 'superteam error: ' + e.message); return []; }
}

function parseJson(raw) {
  const s = String(raw || '').trim();
  try { return JSON.parse(s); } catch (e) {}
  const start = s.indexOf('{'); if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) { try { return JSON.parse(s.slice(start, i+1)); } catch (e) { return null; } } }
  }
  return null;
}

function heuristicScore(finding) {
  const t = (finding.title + ' ' + finding.description).toLowerCase();
  const highMatch = ['hackathon','hack','blockchain','web3','solidity','solana','ethereum','smart contract','mvp','build','develop','code','programming','agent','bot','api'];
  const lowMatch = ['video','edit','marketing','twitter','social media','banner','poster','nft','design'];
  let score = 4;
  if (highMatch.some(function(k){ return t.includes(k); })) score = 8;
  else if (lowMatch.some(function(k){ return t.includes(k); })) score = 3;
  const rewardMatch = String(finding.reward || '').match(/\d+/);
  if (rewardMatch && Number(rewardMatch[0]) >= 1000) score = Math.min(10, score + 1);
  return score;
}

async function analyzeRelevance(finding) {
  const prompt = 'قيّم الفرصة لمشروع "عمالقة الصمت" (فريق مطورين Node.js + Solidity + Web3 + بوتات AI).\n\nالعنوان: ' + finding.title + '\nالوصف: ' + finding.description + '\nالمكافأة: ' + finding.reward + '\n\nأعد JSON فقط:\n{"score": 7, "reason": "سبب قصير بالعربية", "actionable": true}\n\n7-10: يناسبنا مباشرة (Web3, بوتات, هكاثونات).\n4-6: محتمل.\n0-3: لا يناسبنا (تصميم/فيديو/تسويق فقط).\n\nردك:';
  try {
    const raw = await callModel('aurora', prompt, { noJsonMode: false, maxTokens: 400 });
    const parsed = parseJson(raw);
    if (parsed && typeof parsed.score === 'number') {
      return { score: Math.min(10, Math.max(0, Number(parsed.score))), reason: String(parsed.reason || '').slice(0, 300), actionable: Boolean(parsed.actionable) };
    }
    const score = heuristicScore(finding);
    return { score, reason: 'تحليل تلقائي', actionable: score >= 7 };
  } catch (e) {
    const score = heuristicScore(finding);
    return { score, reason: 'تحليل تلقائي (AI محدود)', actionable: score >= 7 };
  }
}

async function runScan() {
  info('bounty-scout', 'Starting bounty scan...');
  const all = [];
  try { const r = await fetchSuperteamEarn(); info('bounty-scout', 'Superteam: ' + r.length); if (r.length) all.push.apply(all, r); } catch (e) {}

  if (all.length === 0) { info('bounty-scout', 'No findings this cycle'); return { added: 0, alerts: 0 }; }

  let added = 0;
  const alerts = [];
  const toAnalyze = all.slice(0, MAX_ANALYZE);

  for (let i = 0; i < toAnalyze.length; i++) {
    const f = toAnalyze[i];
    try {
      const exists = db.prepare('SELECT id FROM bounty_findings WHERE title = ? LIMIT 1').get(f.title);
      if (exists) continue;
      const analysis = await analyzeRelevance(f);
      db.prepare('INSERT INTO bounty_findings(source,title,url,reward,description,relevance_score,relevance_reason,actionable) VALUES (?,?,?,?,?,?,?,?)').run(f.source, String(f.title).slice(0, 300), f.url || '', f.reward || '', (f.description || '').slice(0, 500), analysis.score, String(analysis.reason).slice(0, 500), analysis.actionable ? 1 : 0);
      added++;
      if (analysis.score >= ALERT_MIN_SCORE && alerts.length < MAX_ALERTS) {
        alerts.push({ ...f, score: analysis.score, reason: analysis.reason });
      }
      // انتظر 3 ثواني قبل الاستدعاء التالي (لتجنب 429)
      if (i < toAnalyze.length - 1) await sleep(AI_CALL_DELAY_MS);
    } catch (e) { warn('bounty-scout', 'insert failed: ' + e.message); }
  }

  if (alerts.length > 0) {
    const lines = ['🎯 فرص مغرية مكتشفة (' + alerts.length + ')', '━━━━━━━━━━━━━━━━━━━', ''];
    for (let i = 0; i < alerts.length; i++) {
      const a = alerts[i];
      lines.push((i+1) + '. [' + a.source + '] ' + a.score + '/10');
      lines.push('   ' + String(a.title).slice(0, 150));
      if (a.reward) lines.push('   💰 ' + a.reward);
      if (a.url) lines.push('   🔗 ' + a.url);
      lines.push('');
    }
    await sendToTelegram(lines.join('\n'));
    info('bounty-scout', 'Alert sent: ' + alerts.length + ' items');
  }

  info('bounty-scout', 'Scan complete: ' + added + ' new, ' + alerts.length + ' alerts');
  return { added, alerts: alerts.length };
}

async function sendDailyReport() {
  try {
    const today = db.prepare("SELECT source,title,url,reward,relevance_score FROM bounty_findings WHERE seen_at >= datetime('now', '-24 hours') AND relevance_score >= 7 ORDER BY relevance_score DESC LIMIT 8").all();
    const total = db.prepare('SELECT COUNT(*) as c FROM bounty_findings').get().c;
    const lines = ['📊 تقرير صياد الفرص', '━━━━━━━━━━━━━━━━━━━', 'التاريخ: ' + new Date().toISOString().slice(0,10), 'إجمالي الفرص: ' + total, ''];
    if (today.length === 0) { lines.push('لا فرص عالية الأهمية اليوم.'); }
    else {
      for (let i = 0; i < today.length; i++) {
        const f = today[i];
        lines.push((i+1) + '. [' + f.source + '] ' + f.relevance_score + '/10');
        lines.push('   ' + String(f.title).slice(0, 150));
        if (f.reward) lines.push('   💰 ' + f.reward);
        if (f.url) lines.push('   🔗 ' + f.url);
        lines.push('');
      }
    }
    await sendToTelegram(lines.join('\n'));
    info('bounty-scout', 'Daily report sent');
    return { sent: true };
  } catch (e) { error('bounty-scout', 'report failed: ' + e.message); return { sent: false }; }
}

async function tick() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const isDaily = now.getHours() === DAILY_REPORT_HOUR && lastDailyReportDay !== today;
  await runScan();
  if (isDaily) { lastDailyReportDay = today; await sendDailyReport(); }
}

export function startBountyScout() {
  info('bounty-scout', 'Started — 6h scans, report at ' + DAILY_REPORT_HOUR + ', delay=' + AI_CALL_DELAY_MS + 'ms, max=' + MAX_ANALYZE);
  setTimeout(function() {
    tick().catch(function(e) { error('bounty-scout', e.message); });
    setInterval(function() { tick().catch(function(e) { error('bounty-scout', e.message); }); }, SCAN_INTERVAL_MS).unref();
  }, INITIAL_DELAY_MS).unref();
}

export async function runNow() { return await runScan(); }
export async function sendReportNow() { return await sendDailyReport(); }
export function getStats() {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM bounty_findings').get().c;
    const today = db.prepare("SELECT COUNT(*) as c FROM bounty_findings WHERE seen_at >= datetime('now', '-24 hours')").get().c;
    return { total, today };
  } catch (e) { return { total: 0, today: 0 }; }
}
