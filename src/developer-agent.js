// developer-agent.js — Autonomous developer & AI news scout (Directed)
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from './db.js';
import { config } from './config.js';
import { callModel } from './ai.js';
import { info, warn, error } from './logger.js';
import { KNOWN_PROBLEMS } from './known-problems.js';

const SCAN_INTERVAL_MS = 12 * 60 * 60 * 1000;
const DAILY_REPORT_HOUR = 11;
const INITIAL_DELAY_MS = 10 * 60 * 1000;
const ALERT_MIN_SCORE = 7;
const ROOT = config.root;

let lastDailyReportDay = null;
let lastScanAt = null;

db.exec('CREATE TABLE IF NOT EXISTS developer_findings (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL, url TEXT DEFAULT "", description TEXT DEFAULT "", relevance_score REAL DEFAULT 0, relevance_reason TEXT DEFAULT "", actionable INTEGER DEFAULT 0, seen_at TEXT DEFAULT CURRENT_TIMESTAMP)');

export function getDevStats() {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM developer_findings').get().c;
    const today = db.prepare("SELECT COUNT(*) as c FROM developer_findings WHERE seen_at >= datetime('now', '-24 hours')").get().c;
    const actionable = db.prepare('SELECT COUNT(*) as c FROM developer_findings WHERE actionable = 1').get().c;
    return { total, today, actionable, lastScanAt };
  } catch (e) { return { total: 0, today: 0, actionable: 0, lastScanAt }; }
}

async function sendToTelegram(text) {
  try {
    const mod = await import('./telegram.js');
    if (typeof mod.sendMessageDetailed === 'function') { await mod.sendMessageDetailed(text); return true; }
  } catch (e) { warn('developer', 'telegram failed: ' + e.message); }
  return false;
}

export function startDeveloperAgent() {
  info('developer', 'Starting 12h scans (directed), daily report at ' + DAILY_REPORT_HOUR + ':00, alerts at score>=' + ALERT_MIN_SCORE);
  setTimeout(function() {
    tick().catch(function(e) { error('developer', e.message); });
    setInterval(function() { tick().catch(function(e) { error('developer', e.message); }); }, SCAN_INTERVAL_MS).unref();
  }, INITIAL_DELAY_MS).unref();
}

async function tick() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const isDaily = now.getHours() === DAILY_REPORT_HOUR && lastDailyReportDay !== today;
  lastScanAt = now.toISOString();
  await runDevScan();
  if (isDaily) { lastDailyReportDay = today; await sendDevReport(); }
}

export async function runNow() { return await runDevScan(); }
export async function sendReportNow() { return await sendDevReport(); }

// ⬇️ البحث الموجه: لكل مشكلة، ابحث بكلماتها
async function fetchDirectedFindings() {
  info('developer', 'Starting directed search for ' + KNOWN_PROBLEMS.length + ' problems...');
  const all = [];
  for (const problem of KNOWN_PROBLEMS) {
    try {
      const keyword = problem.keywords[0] || problem.title;
      // بحث HN المباشر بالكلمات
      const hnResults = await searchHN(keyword);
      for (const r of hnResults) {
        r.problemId = problem.id;
        r.problemTitle = problem.title;
        r.category = 'solution-attempt';
        all.push(r);
      }
      info('developer', 'Problem "' + problem.title + '": ' + hnResults.length + ' HN results');
      // تأخير بسيط بين كل بحث
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (e) {
      warn('developer', 'Directed search for ' + problem.id + ' failed: ' + e.message);
    }
  }
  return all;
}

// البحث في HN بكلمة محددة
async function searchHN(query) {
  try {
    const encoded = encodeURIComponent(query);
    const url = 'https://hn.algolia.com/api/v1/search?query=' + encoded + '&tags=story&hitsPerPage=5';
    const res = await fetch(url, { headers: { 'User-Agent': 'SilentGiants/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    const hits = (data && data.hits) || [];
    return hits.map(function(h) {
      return {
        source: 'HN Search',
        title: h.title || h.story_title || '',
        url: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID),
        description: 'points:' + (h.points || 0) + ' | comments:' + (h.num_comments || 0) + ' | query:' + query
      };
    }).filter(function(x) { return x.title; });
  } catch (e) { return []; }
}

async function runDevScan() {
  info('developer', 'Starting dev scan...');

  // ⬇️ المرحلة 1: البحث الموجه (أهم من الأخبار العامة)
  const directed = [];
  try {
    const r = await fetchDirectedFindings();
    info('developer', 'Directed search: ' + r.length + ' items');
    if (r.length) directed.push.apply(directed, r);
  } catch (e) { warn('developer', 'directed search failed: ' + e.message); }

  // ⬇️ المرحلة 2: الأخبار العامة (كما كان)
  const general = [];
  const sources = [
    { name: 'Hacker News', fn: fetchHN },
    { name: 'Dev.to AI', fn: fetchDevTo }
  ];
  for (const s of sources) {
    try {
      const r = await s.fn();
      info('developer', s.name + ' returned ' + r.length + ' items');
      if (r.length) general.push.apply(general, r);
    } catch (e) { warn('developer', s.name + ' failed: ' + e.message); }
  }

  // نعالج الموجه أولاً (أعلى أهمية)
  const all = directed.concat(general);

  if (all.length === 0) return { added: 0, alerts: 0 };

  let added = 0;
  let alerts = 0;
  const alertQueue = [];

  for (let i = 0; i < Math.min(all.length, 15); i++) {
    const f = all[i];
    try {
      const exists = db.prepare('SELECT id FROM developer_findings WHERE title = ? LIMIT 1').get(f.title);
      if (exists) continue;
      const analysis = await analyzeRelevance(f);
      db.prepare('INSERT INTO developer_findings(category,source,title,url,description,relevance_score,relevance_reason,actionable) VALUES (?,?,?,?,?,?,?,?)')
        .run(f.category || 'ai-news', f.source, String(f.title).slice(0, 300), f.url || '', String(f.description || '').slice(0, 500), analysis.score, String(analysis.reason).slice(0, 500), analysis.actionable ? 1 : 0);
      added++;
      if (analysis.score >= ALERT_MIN_SCORE && analysis.actionable) {
        alertQueue.push({
          source: f.source,
          title: f.title,
          url: f.url,
          description: f.description,
          score: analysis.score,
          reason: analysis.reason,
          actionable: analysis.actionable,
          problemTitle: f.problemTitle || ''
        });
      }
    } catch (e) { warn('developer', 'insert failed: ' + e.message); }
  }

  if (alertQueue.length > 0) {
    await sendAlert(alertQueue);
    alerts = alertQueue.length;
  }
  info('developer', 'Scan complete: ' + added + ' new findings (' + alerts + ' alerts sent)');
  return { added, alerts };
}

async function sendAlert(items) {
  try {
    const lines = [
      '🎯 حلول لمشاكلنا الفعلية',
      '━━━━━━━━━━━━━━━━━━━',
      'عدد الحلول المقترحة: ' + items.length,
      ''
    ];
    for (let i = 0; i < items.length; i++) {
      const f = items[i];
      lines.push((i + 1) + '. أهمية ' + f.score + '/10');
      if (f.problemTitle) lines.push('   🎯 يخص: ' + String(f.problemTitle).slice(0, 100));
      lines.push('   المصدر: ' + f.source);
      lines.push('   العنوان: ' + String(f.title).slice(0, 200));
      if (f.url) lines.push('   🔗 ' + f.url);
      if (f.reason) lines.push('   السبب: ' + String(f.reason).slice(0, 200));
      lines.push('');
    }
    await sendToTelegram(lines.join('\n'));
    info('developer', 'Alert sent: ' + items.length + ' high-value items');
    return true;
  } catch (e) {
    error('developer', 'alert failed: ' + e.message);
    return false;
  }
}

async function fetchHN() {
  try {
    const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!res.ok) return [];
    const ids = await res.json();
    const out = [];
    for (let i = 0; i < Math.min(ids.length, 8); i++) {
      try {
        const itemRes = await fetch('https://hacker-news.firebaseio.com/v0/item/' + ids[i] + '.json');
        if (!itemRes.ok) continue;
        const item = await itemRes.json();
        if (item && item.title) out.push({ category: 'hn', source: 'HackerNews', title: item.title, url: item.url || ('https://news.ycombinator.com/item?id=' + item.id), description: 'score:' + (item.score || 0) + ' | comments:' + (item.descendants || 0) });
      } catch (e) {}
    }
    return out;
  } catch (e) { return []; }
}

async function fetchDevTo() {
  try {
    const res = await fetch('https://dev.to/api/articles?tag=ai&top=1&per_page=8', { headers: { 'User-Agent': 'SilentGiants/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map(function(a) {
      return { category: 'devto', source: 'Dev.to', title: a.title || '', url: a.url || '', description: (a.description || '').slice(0, 200) + ' | reactions:' + (a.public_reactions_count || 0) };
    }).filter(function(x) { return x.title; });
  } catch (e) { return []; }
}

async function analyzeRelevance(finding) {
  try {
    // ⬇️ إذا كان الاكتشاف من البحث الموجه (له مشكلة معروفة)
    const isDirected = finding.category === 'solution-attempt';
    let prompt;

    if (isDirected) {
      prompt = 'قيّم هذا الحل المحتمل لمشكلة معروفة في مشروع "عمالقة الصمت".\n\n' +
        '🎯 المشكلة: ' + (finding.problemTitle || '') + '\n' +
        'العنوان: ' + finding.title + '\n' +
        'الوصف: ' + finding.description + '\n\n' +
        'أجب بصيغة JSON فقط:\n' +
        '{"score": 0-10, "reason": "سبب قصير بالعربية", "actionable": true|false}\n\n' +
        'معايير التقييم:\n' +
        '- هل يحل المشكلة فعلاً؟ (4 نقاط)\n' +
        '- هل هو مجاني/مفتوح المصدر؟ (3 نقاط)\n' +
        '- هل يعمل بدون تسجيل/KYC؟ (3 نقاط)\n\n' +
        'actionable=true فقط إذا كان قابلاً للتطبيق مباشرة.';
    } else {
      prompt = 'قيّم هذا الاكتشاف للذكاء الاصطناعي لمشروع "عمالقة الصمت" (بوت Node.js، 5 وكلاء، يستخدم Z.ai + Cloudflare + Pollinations).\n\n' +
        'العنوان: ' + finding.title + '\n' +
        'الوصف: ' + finding.description + '\n\n' +
        'أجب بصيغة JSON فقط: {"score": 0-10, "reason": "سبب قصير بالعربية", "actionable": true|false}\n\n' +
        '0-3 غير مفيد، 4-6 مثير، 7-10 مفيد مباشرة (أداة/مكتبة/API يمكن دمجها).';
    }

    const raw = await callModel('developer', prompt, { noJsonMode: false, maxTokens: 200 });
    const parsed = parseJson(raw);
    if (!parsed) return { score: 3, reason: 'فشل التحليل', actionable: false };
    return {
      score: Math.min(10, Math.max(0, Number(parsed.score) || 0)),
      reason: String(parsed.reason || ''),
      actionable: Boolean(parsed.actionable)
    };
  } catch (e) { return { score: 3, reason: 'خطأ التحليل', actionable: false }; }
}

function parseJson(raw) {
  const s = String(raw || '').trim();
  try { return JSON.parse(s); } catch (e) {}
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) { try { return JSON.parse(s.slice(start, i+1)); } catch (e) { return null; } } }
  }
  return null;
}

async function analyzeRepository() {
  try {
    const srcDir = path.join(ROOT, 'src');
    const files = await fs.readdir(srcDir);
    let totalFiles = 0;
    let totalLines = 0;
    for (const f of files.slice(0, 15)) {
      try {
        const full = path.join(srcDir, f);
        const stat = await fs.stat(full);
        if (stat.isFile() && f.endsWith('.js')) {
          const content = await fs.readFile(full, 'utf8');
          totalFiles++;
          totalLines += content.split('\n').length;
        }
      } catch (e) {}
    }
    return { totalFiles, totalLines, srcFiles: files.length };
  } catch (e) { return { error: e.message }; }
}

async function sendDevReport() {
  try {
    const today = db.prepare("SELECT category,source,title,url,relevance_score,relevance_reason,actionable FROM developer_findings WHERE seen_at >= datetime('now', '-24 hours') AND relevance_score >= 6 ORDER BY relevance_score DESC LIMIT 10").all();
    const stats = getDevStats();
    const repo = await analyzeRepository();
    const lines = [
      '👨‍💻 تقرير وكيل المطور',
      '━━━━━━━━━━━━━━━━━━━',
      'التاريخ: ' + new Date().toISOString().slice(0, 10),
      'إجمالي الاكتشافات: ' + stats.total,
      'خلال 24 ساعة: ' + stats.today,
      'قابلة للتطبيق: ' + stats.actionable,
      '',
      '📁 تحليل المستودع:',
      '  ملفات JS في src/: ' + (repo.totalFiles || 0),
      '  إجمالي الأسطر: ' + (repo.totalLines || 0),
      '  إجمالي عناصر src/: ' + (repo.srcFiles || 0),
      ''
    ];
    if (today.length === 0) {
      lines.push('لا توجد اكتشافات عالية الأهمية اليوم.');
    } else {
      lines.push('🎯 أهم ' + today.length + ' اكتشافات:');
      lines.push('');
      for (let i = 0; i < today.length; i++) {
        const f = today[i];
        const icon = f.actionable ? '🎯' : '📌';
        lines.push((i + 1) + '. ' + icon + ' [' + f.source + '] أهمية ' + f.relevance_score + '/10');
        lines.push('   ' + String(f.title).slice(0, 150));
        if (f.url) lines.push('   🔗 ' + f.url);
        if (f.relevance_reason) lines.push('   السبب: ' + String(f.relevance_reason).slice(0, 150));
        lines.push('');
      }
    }
    await sendToTelegram(lines.join('\n'));
    info('developer', 'Daily report sent: ' + today.length + ' items');
    return { sent: true, count: today.length };
  } catch (e) {
    error('developer', 'daily report failed: ' + e.message);
    return { sent: false, error: e.message };
  }
}
