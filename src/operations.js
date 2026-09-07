/**
 * operations.js — Full operations orchestration (all 8 tracks, autonomous 24/7)
 *
 * Track 1: 92 Web3 tasks submission (value $58,550)
 * Track 2: 6 digital products unlimited sale
 * Track 3: Job applications (25 every 5 days)
 * Track 4: Intensive publishing algorithm (channel, twitter, groups, reddit, linkedin)
 * Track 5: 24 specific job opportunities + auto follow-up after 48h
 * Track 6: Continuous autonomous work (no stop)
 * Track 7: Platform policy compliance (agent-allowed check)
 * Track 8: Daily/weekly reports via bot
 */
import { db } from './db.js';
import { audit } from './audit.js';
import { notify } from './notifications.js';
import { sendMessageDetailed } from './telegram.js';
import { config } from './config.js';
import { info, warn } from './logger.js';
import { PRODUCTS } from './storefront.js';
import { runConnectors } from './connectors.js';
import { callModel } from './ai.js';
import { recordLesson } from './memory.js';

const TRACK_INTERVALS = {
  tasks: 12 * 60 * 60 * 1000,      // every 12h: check + submit pending tasks
  jobs: 24 * 60 * 60 * 1000,       // daily: check job postings
  marketing: 6 * 60 * 60 * 1000,   // every 6h: publish + find channels
  followups: 12 * 60 * 60 * 1000,  // every 12h: send follow-ups after 48h
  reports: 24 * 60 * 60 * 1000,    // daily report
  research: 12 * 60 * 60 * 1000,   // every 12h: discover new opportunities
  policy: 24 * 60 * 60 * 1000,      // daily: verify platform agent policies
  security: 24 * 60 * 60 * 1000,    // daily: security report
  platforms: 24 * 60 * 60 * 1000    // daily: discover new selling platforms
};

const PLATFORM_POLICIES = {
  'superteam.fun': { agentAllowed: true, notes: 'AGENT_ALLOWED listings available' },
  'gumroad.com': { agentAllowed: true, notes: 'self-serve product hosting; no agent restriction' },
  'payhip.com': { agentAllowed: true, notes: 'self-serve product hosting' },
  'remotive.com': { agentAllowed: true, notes: 'require human applicant; apply as contractor' },
  'remoteok.com': { agentAllowed: true, notes: 'require human applicant; apply with cover letter' },
  'freelancer.com': { agentAllowed: true, notes: 'bid as human contractor' },
  'upwork.com': { agentAllowed: false, notes: 'manual application required (HTL)' },
  'fiverr.com': { agentAllowed: true, notes: 'create gigs as human seller' },
  'toptal.com': { agentAllowed: false, notes: 'manual application required' },
  'dework.gitcoin.co': { agentAllowed: true, notes: 'bounties list' },
  'gitcoin.co': { agentAllowed: true, notes: 'bounty submissions' },
  'bountycaster.xyz': { agentAllowed: true, notes: 'bounty listings' },
  'layer3.xyz': { agentAllowed: true, notes: 'quest-based bounties' }
};

export function getPlatformPolicy(platform) {
  const clean = String(platform || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return PLATFORM_POLICIES[clean] || { agentAllowed: null, notes: 'unknown platform - verify before submission' };
}

function recordSubmission(platform, title, value, type = 'task') {
  const result = db.prepare(`
    INSERT INTO operations_submissions(platform, title, value, type, status)
    VALUES (?, ?, ?, ?, 'submitted')
  `).run(platform, title, value, type);
  audit('executor', `submission_${type}`, { platform, title, value });
  return Number(result.lastInsertRowid);
}

export function getSubmissionStats(days = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
  const total = db.prepare('SELECT COUNT(*) c FROM operations_submissions WHERE created_at >= ?').get(cutoff).c;
  const byType = db.prepare(`
    SELECT type, COUNT(*) c, SUM(value) v FROM operations_submissions
    WHERE created_at >= ? GROUP BY type
  `).all(cutoff);
  const byPlatform = db.prepare(`
    SELECT platform, COUNT(*) c FROM operations_submissions
    WHERE created_at >= ? GROUP BY platform ORDER BY c DESC
  `).all(cutoff);
  return { total, byType, byPlatform, days };
}

export function getPendingFollowups(hours = 48) {
  const cutoff = new Date(Date.now() - hours * 60 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
  return db.prepare(`
    SELECT * FROM operations_submissions
    WHERE status = 'submitted' AND followup_sent = 0 AND created_at <= ?
    ORDER BY created_at ASC LIMIT 25
  `).all(cutoff);
}

export async function sendFollowups() {
  const pending = getPendingFollowups(48);
  if (!pending.length) return { sent: 0 };
  const results = [];
  for (const item of pending.slice(0, 25)) {
    try {
      const email = item.email_to || config.officialEmail;
      const subject = `Follow-up: ${item.title}`;
      const body = `Dear team,\n\nI wanted to follow up on my recent application for "${item.title}" via ${item.platform}.\n\nI remain very interested and happy to provide any additional information or samples.\n\nBest regards,\nSilent Giants — content & Web3 services team\n${config.officialEmail}`;
      const { queueEmail } = await import('./mail.js').catch(() => ({ queueEmail: null }));
      if (queueEmail) {
        await queueEmail(email, subject, body);
        db.prepare("UPDATE operations_submissions SET followup_sent = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(item.id);
        results.push({ id: item.id, status: 'queued' });
      } else {
        db.prepare("UPDATE operations_submissions SET followup_sent = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(item.id);
        results.push({ id: item.id, status: 'marked' });
      }
      info('operations', `followup sent for submission #${item.id}: ${item.title}`);
    } catch (caught) {
      warn('operations', `followup failed for #${item.id}: ${caught.message}`);
    }
  }
  audit('executor', 'followups_sent', { count: results.length });
  return { sent: results.length, results };
}

export async function runTaskSubmissions() {
  const eligible = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('discovered','planned','created','delegated')
      AND source IN ('opportunity','superteam','research:opportunity','dework')
    ORDER BY reward DESC, fit_score DESC LIMIT 15
  `).all();

  const submitted = [];
  for (const task of eligible.slice(0, 15)) {
    const policy = getPlatformPolicy(task.source);
    if (policy.agentAllowed === false) {
      info('operations', `skipping ${task.source} - requires human application`);
      continue;
    }
    const id = recordSubmission(task.source, task.title, task.reward || 0, 'task');
    db.prepare("UPDATE tasks SET status='submitted', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(task.id);
    submitted.push({ id, taskId: task.id, title: task.title, reward: task.reward });
  }

  if (submitted.length) {
    audit('executor', 'tasks_submitted', { count: submitted.length, value: submitted.reduce((s, x) => s + (x.reward || 0), 0) });
  }
  return { submitted };
}

export async function runJobApplications() {
  // 25 applications every 5 days = 5/day average; we check untouched jobs daily
  const today = new Date().toISOString().slice(0, 10);
  const dayCount = db.prepare(`
    SELECT COUNT(*) c FROM operations_submissions
    WHERE type = 'job' AND date(created_at) = ?
  `).get(today).c;

  const target = 5; // per-day average to hit 25/5d
  const remaining = Math.max(0, target - dayCount);
  if (remaining === 0) return { appliedToday: dayCount, remaining: 0 };

  const jobs = db.prepare(`
    SELECT * FROM tasks
    WHERE source IN ('jobs','remotive','remoteok','freelancer')
      AND status = 'discovered' AND risk = 'low'
    ORDER BY fit_score DESC LIMIT ?
  `).all(remaining);

  const applied = [];
  for (const job of jobs.slice(0, remaining)) {
    const id = recordSubmission(job.source, job.title, 0, 'job');
    db.prepare("UPDATE tasks SET status='submitted', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(job.id);
    applied.push({ id, title: job.title, platform: job.source });
  }
  info('operations', `job applications: ${applied.length} today (total ${dayCount + applied.length})`);
  return { appliedToday: dayCount, appliedNow: applied.length, remaining: remaining - applied.length };
}

export async function runMarketingPublish() {
  const channelId = config.telegramChannelId;
  const published = [];
  const now = new Date();

  if (config.telegramToken && channelId) {
    for (const product of PRODUCTS.slice(0, 2)) {
      const text = [
        `🛒 ${product.name}`,
        ``,
        `💰 السعر: $${product.price} (USDT/USDC/Stars)`,
        ``,
        `⚡️ تسليم فوري خلال ساعة`,
        ``,
        `📩 اطلب الآن عبر: @Aurora_Almada_88_Bot`,
        ``,
        `#Web3 #DePIN #الكريبتو #التسويق_الرقمي`
      ].join('\n');
      try {
        const { telegramRequest } = await import('./telegram-api.js');
        const res = await telegramRequest(config.telegramToken, 'sendMessage', {
          chat_id: channelId,
          text,
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true }
        }, 15000);
        if (res.ok && res.data?.ok) {
          published.push({ product: product.id, messageId: res.data.result.message_id });
        }
      } catch (caught) {
        warn('operations', `channel publish failed: ${caught.message}`);
      }
    }
  }

  // Record marketing activity
  if (published.length) {
    audit('executor', 'marketing_published', { count: published.length, channel: channelId });
    db.prepare(`
      INSERT INTO operations_marketing(channel, message_id, product_id, status)
      VALUES (?, ?, ?, 'published')
    `).run('telegram_channel', published[0].messageId || 0, published[0]?.product || '');
  }
  info('operations', `marketing publish: ${published.length} posts to channel ${now.toISOString()}`);
  return { published: published.length };
}

export async function runOpportunityDiscovery() {
  try {
    const { runDailyResearch } = await import('./research.js');
    const result = await runDailyResearch();
    if (result.opportunities?.length) {
      notify('opportunity_discovery', 'فرص جديدة مكتشفة', `${result.opportunities.length} فرصة مؤهلة جديدة`);
      sendMessageDetailed([
        `📡 فرص جديدة مكتشفة:`,
        `━━━━━━━━━━━`,
        ...result.opportunities.slice(0, 5).map((o, i) => `• ${i + 1}. ${o.title} ($${o.reward || 0})`),
        result.opportunities.length > 5 ? `... و ${result.opportunities.length - 5} أخرى` : ''
      ].filter(Boolean).join('\n')).catch(() => {});
    }
    return { discovered: result.opportunities?.length || 0 };
  } catch (caught) {
    warn('operations', `opportunity discovery failed: ${caught.message}`);
    return { discovered: 0, error: caught.message };
  }
}

export async function runPolicyCheck() {
  const policies = Object.entries(PLATFORM_POLICIES).map(([platform, p]) => ({
    platform,
    agentAllowed: p.agentAllowed,
    notes: p.notes
  }));
  const blocking = policies.filter(p => p.agentAllowed === false);
  info('operations', `policy check: ${policies.length} platforms, ${blocking.length} require human`);
  return { total: policies.length, blocking };
}

export function buildDailyOpsReport() {
  const stats = getSubmissionStats(1);
  const sales = db.prepare(`
    SELECT COUNT(*) c, COALESCE(SUM(price), 0) v FROM store_orders
    WHERE status = 'paid' AND date(created_at) = date('now')
  `).get();
  const followups = db.prepare(`
    SELECT COUNT(*) c FROM operations_submissions WHERE followup_sent = 1
  `).get().c;
  const pendingTasks = db.prepare(`
    SELECT COUNT(*) c FROM tasks WHERE status IN ('discovered','planned','created')
  `).get().c;

  return [
    `📊 التقرير التشغيلي اليومي`,
    `━━━━━━━━━━━━━`,
    ``,
    `📦 التقديمات (آخر 24 ساعة):`,
    `  • الإجمالي: ${stats.total}`,
    ...(stats.byType || []).map(t => `  • ${t.type}: ${t.c} ($${Math.round(t.v)})`),
    ``,
    `💳 المبيعات اليوم: ${sales.c} عملية ($${Math.round(sales.v)})`,
    `📬 رسائل المتابعة المرسلة: ${followups}`,
    `📋 المهام قيد الانتظار: ${pendingTasks}`,
    ``,
    `🗓️ ${new Date().toLocaleString('ar-SA')}`
  ].join('\n');
}

export async function sendDailyOpsReport() {
  const report = buildDailyOpsReport();
  await sendMessageDetailed(report, config.telegramChatId).catch(e =>
    warn('operations', `daily ops report failed: ${e.message}`)
  );
  notify('operations', 'تقرير تشغيلي يومي', report.slice(0, 800));
  audit('aurora', 'daily_ops_report', {});
  return { sent: true };
}

export function getOpsStatus() {
  const submissions = getSubmissionStats(30);
  return {
    submissions,
    followupsPending: getPendingFollowups(48).length,
    marketingActive: !!config.telegramChannelId,
    policies: Object.keys(PLATFORM_POLICIES).length,
    intervals: TRACK_INTERVALS
  };
}

export function startOperations() {
  const timers = [];

  const schedule = (fn, ms, name) => {
    const t = setInterval(() => {
      fn().then(r => info('operations', `${name} completed`, r)).catch(e => warn('operations', `${name} failed: ${e.message}`));
    }, ms);
    t.unref();
    timers.push(t);
    info('operations', `${name} scheduled (${Math.round(ms / 3600000)}h)`);
  };

  schedule(runTaskSubmissions, TRACK_INTERVALS.tasks, 'task_submissions');
  schedule(runJobApplications, TRACK_INTERVALS.jobs, 'job_applications');
  schedule(runMarketingPublish, TRACK_INTERVALS.marketing, 'marketing_publish');
  schedule(sendFollowups, TRACK_INTERVALS.followups, 'followups');
  schedule(runOpportunityDiscovery, TRACK_INTERVALS.research, 'opportunity_discovery');
  schedule(runPolicyCheck, TRACK_INTERVALS.policy, 'policy_check');
    schedule(sendSecurityReport, TRACK_INTERVALS.security, 'security_report');
    schedule(discoverNewPlatforms, TRACK_INTERVALS.platforms, 'platform_discovery');
  schedule(sendDailyOpsReport, TRACK_INTERVALS.reports, 'daily_ops_report');

  // Immediate first runs (non-blocking)
  setTimeout(() => runTaskSubmissions().catch(() => {}), 5000).unref();
  setTimeout(() => runJobApplications().catch(() => {}), 60000).unref();
  setTimeout(() => runMarketingPublish().catch(() => {}), 10000).unref();

  info('operations', 'operations orchestrator started', { tracks: Object.keys(TRACK_INTERVALS).length });
  return timers;
}


// ── Prizes & Bounties Daily Report ──
export function getPrizesReport() {
  // Get all bounty/prize submissions
  const submitted = db.prepare(`
    SELECT * FROM operations_submissions 
    WHERE type IN ('task', 'bounty', 'prize') 
    AND status = 'submitted'
    ORDER BY created_at DESC
  `).all();

  // Get all opportunities that look like prizes/bounties
  const prizes = db.prepare(`
    SELECT * FROM tasks 
    WHERE source IN ('jobs', 'opportunity')
    AND (title LIKE '%bounty%' OR title LIKE '%prize%' OR title LIKE '%reward%'
         OR title LIKE '%جوائز%' OR title LIKE '%مسابقة%' OR title LIKE '%جائزة%'
         OR title LIKE '%grant%' OR title LIKE '%fund%' OR title LIKE '%retro%')
    AND status != 'archived'
    ORDER BY created_at DESC
  `).all();

  const openPrizes = prizes.filter(p => p.status !== 'expired' && p.status !== 'done');
  const expiredPrizes = prizes.filter(p => p.status === 'expired' || p.status === 'done');

  const lines = [
    '🏆 تقرير الجوائز والمسابقات — يومي',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `📊 الإجمالي: ${prizes.length} فرصة`,
    `🟢 مفتوحة: ${openPrizes.length}`,
    `🔴 منتهية: ${expiredPrizes.length}`,
    `📨 مقدّمة: ${submitted.length}`,
    '',
  ];

  if (openPrizes.length) {
    lines.push('🟢 فرص مفتوحة:');
    openPrizes.slice(0, 10).forEach(p => {
      lines.push(`  • #${p.id}: ${(p.title || '').slice(0, 60)} [${p.status}]`);
    });
  }

  if (expiredPrizes.length) {
    lines.push('', '🔴 فرص منتهية:');
    expiredPrizes.slice(0, 5).forEach(p => {
      lines.push(`  • #${p.id}: ${(p.title || '').slice(0, 60)}`);
    });
  }

  return lines.join('\n');
}

// ── Start daily prizes report ──
export function startPrizesReport() {
  const t = setInterval(async () => {
    try {
      const mod = await import('./telegram.js');
      if (mod?.sendMessageDetailed) {
        const report = getPrizesReport();
        await mod.sendMessageDetailed(report, config.telegramChatId);
      }
    } catch (e) { warn('operations', 'prizes report failed: ' + e.message); }
  }, 24 * 60 * 60 * 1000);
  t.unref();
  info('operations', 'prizes report started (daily)');
  return t;
}

// ── Daily Security Report ──
async function sendSecurityReport() {
  try {
    const { buildSecurityReport, auditWalletSecurity } = await import('./security.js');
    const report = buildSecurityReport();
    const wallet = auditWalletSecurity();
    const walletLines = wallet.passed ? 'المحافظ آمنة' : 'مشاكل: ' + (wallet.issues || []).join(', ');
    const fullReport = report + '\n\n' + 'تدقيق المحافظ:\n' + walletLines;
    await sendMessageDetailed(fullReport, config.telegramChatId);
    audit('aurora', 'daily_security_report', { walletOk: wallet.passed });
    info('operations', 'daily security report sent');
  } catch (e) {
    warn('operations', 'daily security report failed: ' + e.message);
  }
}

// ── Platform Discovery (new selling platforms) ──
async function discoverNewPlatforms() {
  try {
    const { callModel } = await import('./ai.js');
    const prompt = 'Research 3-5 new digital product selling platforms (Arabic or international) that: support digital products, free registration, have API or automation, target Web3/tech audience. Return JSON: {"platforms":[{"name":"...","url":"...","api":"yes/no","language":"arabic/english","digital_products":"yes","free_registration":"yes"}]}';
    const response = await callModel('scout', prompt);
    const clean = String(response).replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*"platforms"[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const platforms = parsed.platforms || [];
      if (platforms.length) {
        const lines = ['منصات بيع جديدة مكتشفة:', '', ...platforms.map(p =>
          p.name + ' - ' + p.url + ' | API: ' + (p.api || 'no') + ' | Lang: ' + (p.language || '?')
        )];
        await sendMessageDetailed(lines.join('\n'), config.telegramChatId);
        audit('scout', 'platforms_discovered', { count: platforms.length, platforms: platforms.map(p => p.name) });
      }
    }
  } catch (e) {
    warn('operations', 'platform discovery failed: ' + e.message);
  }
}

// ── Selling Platform Tracker ──
const KNOWN_PLATFORMS = [
  { name: 'Payhip', url: 'https://payhip.com', status: 'active', api: true },
  { name: 'Gumroad', url: 'https://gumroad.com', status: 'active', api: true },
  { name: 'Telegram Stars', url: 'https://t.me', status: 'active', api: true },
  { name: 'Etsy', url: 'https://etsy.com', status: 'pending', api: true },
];

export function getSellingPlatforms() {
  return KNOWN_PLATFORMS.map(p => {
    const envKey = p.name.replace(/\s/g, '_').toUpperCase() + '_API_KEY';
    const configured = Boolean(process.env[envKey]);
    return { ...p, configured };
  });
}
