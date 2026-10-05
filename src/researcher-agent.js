// researcher-agent.js — Autonomous AI news researcher
import { db } from './db.js';
import { callModel } from './ai.js';
import { info, warn, error } from './logger.js';

const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DAILY_REPORT_HOUR = 10;
const INITIAL_DELAY_MS = 5 * 60 * 1000;

let lastDailyReportDay = null;
let lastScanAt = null;
let totalFindings = 0;

db.exec('CREATE TABLE IF NOT EXISTS research_findings (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, title TEXT NOT NULL, url TEXT DEFAULT "", description TEXT DEFAULT "", relevance_score REAL DEFAULT 0, relevance_reason TEXT DEFAULT "", actionable INTEGER DEFAULT 0, seen_at TEXT DEFAULT CURRENT_TIMESTAMP)');

export function getStats() {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM research_findings').get().c;
    const today = db.prepare("SELECT COUNT(*) as c FROM research_findings WHERE seen_at >= datetime('now', '-24 hours')").get().c;
    const actionable = db.prepare('SELECT COUNT(*) as c FROM research_findings WHERE actionable = 1').get().c;
    return { total, today, actionable, lastScanAt, totalFindings };
  } catch (e) { return { total: 0, today: 0, actionable: 0, lastScanAt, totalFindings }; }
}

export function getRecentFindings(limit) {
  try { return db.prepare('SELECT * FROM research_findings ORDER BY seen_at DESC LIMIT ?').all(limit || 20); }
  catch (e) { return []; }
}

async function sendToTelegram(text) {
  try {
    const mod = await import('./telegram.js');
    if (typeof mod.sendMessageDetailed === 'function') { await mod.sendMessageDetailed(text); return true; }
  } catch (e) { warn('researcher', 'telegram failed: ' + e.message); }
  return false;
}

export function startResearcher() {
  info('researcher', 'Starting 6h scans, daily report at ' + DAILY_REPORT_HOUR + ':00');
  setTimeout(function() {
    tick().catch(function(e) { error('researcher', e.message); });
    setInterval(function() { tick().catch(function(e) { error('researcher', e.message); }); }, SCAN_INTERVAL_MS).unref();
  }, INITIAL_DELAY_MS).unref();
}

async function tick() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const isDaily = now.getHours() === DAILY_REPORT_HOUR && lastDailyReportDay !== today;
  lastScanAt = now.toISOString();
  await runScan();
  if (isDaily) { lastDailyReportDay = today; await sendDailyReport(); }
}

export async function runNow() { return await runScan(); }
export async function sendReportNow() { return await sendDailyReport(); }

async function runScan() {
  info('researcher', 'Starting AI news scan...');
  const findings = [];
  try {
    const gh = await fetchGithubTrending();
    if (gh && gh.length) findings.push.apply(findings, gh);
  } catch (e) { warn('researcher', 'github scan failed: ' + e.message); }
  try {
    const hf = await fetchHuggingFace();
    if (hf && hf.length) findings.push.apply(findings, hf);
  } catch (e) { warn('researcher', 'hf scan failed: ' + e.message); }
  if (findings.length === 0) { info('researcher', 'No findings this cycle'); return { added: 0 }; }
  let added = 0;
  for (let i = 0; i < Math.min(findings.length, 15); i++) {
    const f = findings[i];
    try {
      const exists = db.prepare('SELECT id FROM research_findings WHERE title = ? LIMIT 1').get(f.title);
      if (exists) continue;
      const analysis = await analyzeRelevance(f);
      db.prepare('INSERT INTO research_findings(source,title,url,description,relevance_score,relevance_reason,actionable) VALUES (?,?,?,?,?,?,?)')
        .run(f.source, String(f.title).slice(0, 300), f.url || '', String(f.description || '').slice(0, 500), analysis.score, String(analysis.reason).slice(0, 500), analysis.actionable ? 1 : 0);
      added++;
      totalFindings++;
    } catch (e) { warn('researcher', 'insert failed: ' + e.message); }
  }
  info('researcher', 'Scan complete: ' + added + ' new findings');
  return { added };
}

async function fetchGithubTrending() {
  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const url = 'https://api.github.com/search/repositories?q=topic:ai+created:>' + since + '&sort=stars&order=desc&per_page=10';
    const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'SG/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map(function(r) {
      return { source: 'github', title: r.full_name + ' - ' + (r.description || '').slice(0, 80), url: r.html_url, description: (r.description || '') + ' | stars:' + r.stargazers_count + ' | lang:' + (r.language || '') };
    });
  } catch (e) { return []; }
}

async function fetchHuggingFace() {
  try {
    const res = await fetch('https://huggingface.co/api/models?sort=trending&limit=10', { headers: { 'User-Agent': 'SG/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map(function(m) {
      return { source: 'hf', title: m.modelId || m.id || 'unknown', url: 'https://huggingface.co/' + (m.modelId || m.id), description: 'downloads:' + (m.downloads || 0) + ' | likes:' + (m.likes || 0) };
    });
  } catch (e) { return []; }
}

async function analyzeRelevance(finding) {
  try {
    const prompt = 'Evaluate this AI discovery for Silent Giants (Node.js bot with 5 AI agents using Z.ai, LLM7, HF).\n\nTitle: ' + finding.title + '\nDescription: ' + finding.description + '\n\nAnswer JSON only: {"score": 0-10, "reason": "short reason", "actionable": true|false}\n\n0-3 irrelevant, 4-6 interesting, 7-10 directly useful (tool/library/API we could integrate).';
    const raw = await callModel('researcher', prompt, { noJsonMode: false, maxTokens: 200 });
    const parsed = parseJson(raw);
    if (!parsed) return { score: 3, reason: 'parse failed', actionable: false };
    return { score: Math.min(10, Math.max(0, Number(parsed.score) || 0)), reason: String(parsed.reason || ''), actionable: Boolean(parsed.actionable) };
  } catch (e) { return { score: 3, reason: 'analysis error', actionable: false }; }
}

function parseJson(raw) {
  const s = String(raw || '').trim();
  try { return JSON.parse(s); } catch (e) {}
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(s.slice(start, i + 1)); } catch (e) { return null; }
      }
    }
  }
  return null;
}

async function sendDailyReport() {
  try {
    const today = db.prepare("SELECT source,title,url,relevance_score,relevance_reason,actionable FROM research_findings WHERE seen_at >= datetime('now', '-24 hours') AND relevance_score >= 6 ORDER BY relevance_score DESC LIMIT 10").all();
    const stats = getStats();
    const lines = [
      'AI Research Daily Report',
      '=========================',
      'Date: ' + new Date().toISOString().slice(0, 10),
      'Total findings: ' + stats.total,
      'Findings 24h: ' + stats.today,
      'Actionable: ' + stats.actionable,
      ''
    ];
    if (today.length === 0) {
      lines.push('No high-relevance findings today.');
    } else {
      lines.push('Top ' + today.length + ' items:');
      lines.push('');
      for (let i = 0; i < today.length; i++) {
        const f = today[i];
        const icon = f.actionable ? '[ACTION]' : '[INFO]';
        lines.push((i + 1) + '. ' + icon + ' [' + f.source + '] score ' + f.relevance_score + '/10');
        lines.push('   ' + String(f.title).slice(0, 150));
        if (f.url) lines.push('   ' + f.url);
        if (f.relevance_reason) lines.push('   Reason: ' + String(f.relevance_reason).slice(0, 150));
        lines.push('');
      }
    }
    await sendToTelegram(lines.join('\n'));
    info('researcher', 'Daily report sent: ' + today.length + ' items');
    return { sent: true, count: today.length };
  } catch (e) {
    error('researcher', 'daily report failed: ' + e.message);
    return { sent: false, error: e.message };
  }
}
