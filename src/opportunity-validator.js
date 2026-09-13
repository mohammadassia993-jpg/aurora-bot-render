/**
 * opportunity-validator.js — نظام التحقق قبل الالتزام (الأمر 2026-09-13)
 *
 * القاعدة: أي فرصة أو محفظة أو منتج يمر عبر فحص إلزامي قبل أي التزام.
 * - فحص الفرص: احتيال / منصة وهمية / دفع مسبق / مكافأة غير كافية / رابط غير صالح.
 * - فحص Honeypot: كلمات احتيالية في العقد أو الوصف.
 * - التحقق مع القائد: ملف كامل يُرسل قبل أي تقديم (لا التزام بدون موافقة).
 */
import { db } from './db.js';
import { info } from './logger.js';

const SCAM_KEYWORDS = [
  /airdrop\s+claim/i, /claim.*private\s*key/i, /send\s+(?:your\s+)?(?:tokens?|eth|bnb|usdt).*to/i,
  /seed\s*phrase/i, /wallet\s*sync/i, /verification\s+fee/i, /gas\s*fee.*first/i,
  /100[x×]\s*guaranteed/i, /guaranteed\s+profit/i, /double\s*(?:your|my)\s*tokens/i,
  /official\s+drops?\s+(?:for|link)/i, /limited\s+(?:time\s+)?whitelist/i, /mining\s+pool\s+promo/i,
  /honeypot/i, /rug\s*pull/i, /phishing/i, /malicious\s*contract/i, /backdoor/i, /proxy?\s*contract/i
];

const FAKE_PLATFORM_RE = /unknown[-.]platform|fake[-.]bounty|test[-.]bounty|scam[-.]job|example\.(com|org)/i;

const MIN_REWARD = 50;
const MIN_FIT_SCORE = 40;

function payloadOf(task) {
  if (!task) return {};
  for (const key of ['payload_json', 'result']) {
    const raw = task[key];
    if (typeof raw === 'string' && raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch { /* try next field */ }
    }
  }
  return { ...task };
}

export async function validateOpportunity(task) {
  const reasons = [];
  const payload = payloadOf(task);
  const title = String(task?.title || payload.title || '');
  const source = String(task?.source || payload.source || '');
  const reward = Number(task?.reward ?? payload.reward ?? 0);
  const fit = Number(task?.fit_score ?? payload.fit_score ?? 0);
  const url = String(payload.url || task?.url || '');

  if (!title || !source) return { passed: false, score: 0, reasons: ['مصدر أو عنوان مفقود'] };

  const text = `${title} ${payload.description || ''} ${payload.why || ''}`.toLowerCase();
  for (const re of SCAM_KEYWORDS) {
    if (re.test(text)) {
      reasons.push(`كلمات احتيال: ${re}`);
      return { passed: false, score: 0, reasons };
    }
  }

  if (FAKE_PLATFORM_RE.test(source + ' ' + url)) {
    reasons.push('منصة/رابط وهمي أو تجريبي');
    return { passed: false, score: 0, reasons };
  }

  if (reward > 0 && reward < MIN_REWARD) {
    reasons.push(`المكافأة $${reward} أقل من الحد $${MIN_REWARD}`);
    return { passed: false, score: 0, reasons };
  }

  if (fit > 0 && fit < MIN_FIT_SCORE) {
    reasons.push(`درجة التوافق ${fit} أقل من الحد ${MIN_FIT_SCORE}`);
    return { passed: false, score: 0, reasons };
  }

  if (url) {
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) {
        reasons.push('بروتوكول رابط غير آمن');
        return { passed: false, score: 0, reasons };
      }
    } catch {
      reasons.push('رابط غير صالح');
      return { passed: false, score: 0, reasons };
    }
  }

  if (payload.requiresFunds || payload.upfrontCost > 0) {
    reasons.push('يتطلب دفعاً مسبقاً');
    return { passed: false, score: 0, reasons };
  }

  const score = Math.min(100, Math.round((fit || 60) * 0.6 + (reward > 0 ? 30 : 10) + (url ? 10 : 0)));
  return { passed: true, score, reasons: [] };
}

export function honeypotScan(textOrContract) {
  const text = String(textOrContract || '');
  const hits = [];
  for (const re of SCAM_KEYWORDS) {
    if (re.test(text)) hits.push(re.source);
  }
  return { suspicious: hits.length > 0, hits };
}

export function buildDossier(task) {
  const payload = payloadOf(task);
  return [
    '🔎 فرصة اجتازت الفحص — موافقتك مطلوبة قبل التقديم',
    '━━━━━━━━━━━━━━━',
    `📌 العنوان: ${task?.title || payload.title}`,
    `🏢 المصدر: ${task?.source || payload.source}${payload.company ? ' — ' + payload.company : ''}`,
    `💰 المكافأة: $${task?.reward ?? payload.reward ?? 0}`,
    payload.location ? `📍 الموقع: ${payload.location}` : '',
    payload.salary ? `💵 الراتب: ${payload.salary}` : '',
    `🔗 الرابط: ${payload.url || task?.url || 'غير متوفر'}`,
    payload.tags?.length ? `🏷 التصنيفات: ${payload.tags.join(', ')}` : '',
    '',
    '⚙️ للرد:',
    `  • الموافقة: /approve-apply ${task?.id || payload.taskId} yes`,
    `  • الرفض: /approve-apply ${task?.id || payload.taskId} no`,
    '',
    '⚠️ لا يُنفَّذ أي تقديم قبل موافقتك.'
  ].filter(Boolean).join('\n');
}

export function recordApplySubmission(task, decision) {
  const payload = payloadOf(task);
  const now = new Date().toISOString();
  const summary = {
    taskId: task?.id,
    decision,
    approved_at: now,
    title: task?.title || payload.title,
    source: task?.source || payload.source,
    reward: task?.reward ?? payload.reward ?? 0,
    url: payload.url || ''
  };
  if (decision === 'yes') {
    const existing = db.prepare(`
      SELECT id FROM operations_submissions WHERE platform = ? AND title = ? AND type = 'apply'
    `).get(String(task?.source || payload.source || ''), String(task?.title || payload.title || ''));
    if (!existing) {
      db.prepare(`
        INSERT INTO operations_submissions(platform, title, value, type, status)
        VALUES (?, ?, ?, 'apply', 'submitted')
      `).run(String(task?.source || payload.source || ''), String(task?.title || payload.title || ''), Number(task?.reward ?? payload.reward ?? 0));
      info('opportunity-validator', `apply SUBMITTED for #${task?.id}: ${String(task?.title || '').slice(0, 60)}`);
    }
  }
  return summary;
}

export function approveApplyTask(taskId, decision) {
  const task = db.prepare('SELECT * FROM task_queue WHERE id = ?').get(Number(taskId));
  if (!task || task.category !== 'apply-opportunity') return { error: 'task_not_found_or_not_apply' };
  if (!['yes', 'no'].includes(decision)) return { error: 'invalid_decision' };
  const summary = recordApplySubmission(task, decision);
  db.prepare(`
    UPDATE task_queue SET status='done', result=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(JSON.stringify(summary), task.id);
  info('opportunity-validator', `approval ${decision} for apply task #${task.id}`);
  return { ok: true, decision, summary };
}
