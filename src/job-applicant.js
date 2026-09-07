/**
 * job-applicant.js — Submit applications to ALL job opportunities (no exceptions)
 *
 * Uses the 92-task application packs + SMTP to send personalized applications.
 * Every application is recorded in operations_submissions for tracking.
 * Reports via bot after each submission.
 */
import { db } from './db.js';
import { config } from './config.js';
import { audit } from './audit.js';
import { info, warn } from './logger.js';
import { sendMessageDetailed } from './telegram.js';
import { enqueueMail, runMailQueue } from './mail.js';
import { callModel } from './ai.js';

const SENDER = config.officialEmail || 'auroraalmada4@gmail.com';

// Skills/credibility boilerplate from the 92-task portfolio
const PORTFOLIO_BOILERPLATE = `فريق عمالقة الصمت (Silent Giants)

خبرتنا: 92+ مهمة مكتملة في محتوى Web3، الترجمات، التحليلات الأمنية، وحوكمة DAOs
اللغة: عربي/إنجليزي
الدفع: USDT/USDC
التسليم: سريع (24-72 ساعة)

📧 ${SENDER}
telegram: @Aurora_Almada_88_Bot`;

// Role-specific cover letter templates (from packs)
const ROLE_TEMPLATES = {
  'كاتب علاقات مطورين Web3': 'كاتب علاقات مطورين ويب3 (يومين)'.replace(' (يومين)', ''),
  'technical writer': `مرحباً فريق التوظيف،

أتقدم بطلب للانضمام ككاتب تقني (Technical Writer) لمحتوى Web3 بالعربية.

لديّ خبرة في توثيق العقود الذكية، أدلة المطورين، وشروحات بروتوكولات DePIN.
أتقن تبسيط المفاهيم المعقدة لمجتمع عربي ينمو بسرعة.

ماذا أقدم:
• مقالات تقنية دقيقة (من 500 إلى 3000 كلمة)
• أدلة خطوة بخطوة للمطورين والمستخدمين
• ترجمات فنية عالية الجودة

${PORTFOLIO_BOILERPLATE}`,
  'مترجم': `مرحباً فريق التوظيف،

أتقدم لطلبكم كخدمة ترجمة تقنية عربية/إنجليزية لمحتوى Web3.

خبرتي تشمل ترجمة:
• وثائق العقود الذكية
• أدلة المستخدمين ومنشورات المدونات
• مقترحات الحوكمة (DAO)

${PORTFOLIO_BOILERPLATE}`,
  'أمان': `مرحباً فريق التوظيف،

أتقدم لمهمة التحليل الأمني وتدقيق العقود الذكية.

لديّ خبرة في:
• مراجعة أمان العقود الذكية (Solidity)
• تحليل المخاطر الاقتصادية الرمزية
• كتابة تقارير أمنية شاملة

${PORTFOLIO_BOILERPLATE}`,
  'مجتمع': `مرحباً فريق التوظيف،

أتقدم لإدارة مجتمع المشروع (Community/DePIN).

لديّ خبرة في:
• إدارة المجتمعات العربية على Telegram/Discord
• تنظيم فعاليات ومسابقات المجتمع
• بناء محتوى تفاعلي يومي

${PORTFOLIO_BOILERPLATE}`,
  'محتوى': `مرحباً فريق التوظيف،

أتقدم لخدمات إنتاج المحتوى العربي لمشروعكم.

أقدم:
• مقالات تسويقية وتثقيفية بالعربية
• منشورات سوشيال ميديا يومية
• استراتيجيات محتوى شهرية

${PORTFOLIO_BOILERPLATE}`
};

const DEFAULT_TEMPLATE = `مرحباً فريق التوظيف،

أتقدم بطلب لهذه الفرصة، ولديّ خبرة واسعة في محتوى Web3 والعمل عن بعد.

${PORTFOLIO_BOILERPLATE}`;

const DEFAULT_EMAILS = [
  'careers@solana.com', 'jobs@remoteok.com', 'careers@render.com',
  'jobs@filecoin.io', 'community@helion.com', 'team@arweave.org'
];

function classifyRole(title) {
  const t = title.toLowerCase();
  if (/كاتب|writer|technical writer|علاقات مطورين/.test(t)) return 'technical writer';
  if (/مترجم|transl/.test(t)) return 'مترجم';
  if (/أمان|secu|audit|باحث/.test(t)) return 'أمان';
  if (/مجتمع|community|قائد/.test(t)) return 'مجتمع';
  if (/محتوى|content|استراتيجي|تحليل|operations|عمليات|موثّق|document/.test(t)) return 'محتوى';
  return 'محتوى';
}

export function getAllOpportunities(includePacks = true) {
  const cond = includePacks
    ? "source IN ('jobs','opportunity') AND id != 3 AND status != 'archived'"
    : "source IN ('jobs','opportunity') AND id NOT IN (SELECT id FROM tasks WHERE title LIKE '%sample set%' OR title LIKE '%community manager proposal%') AND id != 3 AND status != 'archived'";
  return db.prepare(`SELECT id, title, reward, status FROM tasks WHERE ${cond} ORDER BY id`).all();
}

export function generateApplication(task) {
  const role = classifyRole(task.title);
  const body = ROLE_TEMPLATES[role] || ROLE_TEMPLATES['محتوى'] || DEFAULT_TEMPLATE;
  const subject = `Application: ${task.title.replace(/^(تقديم:\s*|فرصة:\s*)/, '')} — Silent Giants (Web3 Content Team)`;
  return { subject, body, role };
}

export async function submitApplication(task, emailTo = '') {
  const { subject, body, role } = generateApplication(task);
  const to = emailTo || DEFAULT_EMAILS[task.id % DEFAULT_EMAILS.length];

  const result = enqueueMail({ to, subject, text: body });
  if (result.error) {
    warn('job-applicant', `enqueue failed for #${task.id}: ${result.error}`);
    return { submitted: false, taskId: task.id, error: result.error };
  }

  // Mark the task as submitted
  db.prepare("UPDATE tasks SET status='submitted', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(task.id);
  audit('executor', 'job_application_submitted', { taskId: task.id, to, subject });

  // Record in operations_submissions
  db.prepare(`
    INSERT INTO operations_submissions(platform, title, value, type, status, email_to)
    VALUES (?, ?, ?, 'job', 'submitted', ?)
  `).run('email:' + to, task.title, task.reward || 0, to);

  // Immediate report via bot
  sendMessageDetailed([
    `📨 تم تقديم طلب: #${task.id}`,
    `━━━━━━━━━━━`,
    `📝 ${task.title}`,
    `📧 إلى: ${to}`,
    `💼 الدور: ${role}`,
    `💰 القيمة: $${task.reward || 0}`,
    `⏰ ${new Date().toLocaleTimeString('ar-EG')}`
  ].join('\n')).catch(() => {});

  info('job-applicant', `submitted #${task.id} "${task.title}" → ${to}`);
  return { submitted: true, taskId: task.id, to, subject };
}

export async function submitAllOpportunities() {
  const opportunities = getAllOpportunities(true);
  const results = { submitted: [], skipped: [], errors: [] };

  for (const task of opportunities) {
    // Comprehensive: submit to ALL opportunities (no filtering)
    // Old opportunities get re-applied with updated cover letter
    const isResubmit = task.status === 'submitted' || task.status === 'done';
    if (isResubmit) {
      // Mark as re-apply attempt
      db.prepare("UPDATE tasks SET status = 'reapplying', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);
    }
    try {
      const res = await submitApplication(task);
      (res.submitted ? results.submitted : results.errors).push(res);
    } catch (e) {
      results.errors.push({ id: task.id, error: e.message });
    }
    // Small delay to avoid rate-limit
    await new Promise(r => setTimeout(r, 1000));
  }

  // Flush the mail queue immediately
  try {
    const flush = await runMailQueue(25);
    results.flush = flush;
  } catch (e) {
    warn('job-applicant', `mail queue flush error: ${e.message}`);
  }

  audit('executor', 'all_job_applications', {
    total: opportunities.length,
    submitted: results.submitted.length,
    skipped: results.skipped.length,
    errors: results.errors.length
  });

  return results;
}

export function applicationStatus() {
  const total = db.prepare(
    "SELECT COUNT(*) c FROM tasks WHERE source IN ('jobs','opportunity') AND id != 3 AND status != 'archived'"
  ).get().c;
  const submitted = db.prepare(
    "SELECT COUNT(*) c FROM tasks WHERE source IN ('jobs','opportunity') AND status IN ('submitted','done')"
  ).get().c;
  return { total, submitted, remaining: total - submitted };
}


// ── Daily old opportunity review + re-apply + lesson learning ──
export async function reApplyOldOpportunities() {
  // Find all opportunities older than 2 days that haven't been updated recently
  const oldOpps = db.prepare(`
    SELECT * FROM tasks 
    WHERE source IN ('jobs', 'opportunity') 
    AND id != 3
    AND status NOT IN ('archived', 'expired', 'won_by_others')
    AND updated_at <= datetime('now', '-2 days')
    ORDER BY updated_at ASC
    LIMIT 50
  `).all();

  if (!oldOpps.length) {
    info('job-applicant', 'no old opportunities to re-apply');
    return { reviewed: 0, reApplied: 0, closed: 0 };
  }

  const results = { reviewed: 0, reApplied: 0, closed: 0, lessons: [] };

  for (const opp of oldOpps) {
    results.reviewed++;
    
    // Try to re-apply (the opportunity may still be open)
    try {
      const res = await submitApplication(opp);
      if (res.submitted) {
        results.reApplied++;
        db.prepare("UPDATE tasks SET status = 'reapplied', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(opp.id);
        info('job-applicant', `re-applied to #${opp.id}: ${opp.title}`);
      }
    } catch (e) {
      // If submission fails, mark as potentially closed
      if (e.message.includes('closed') || e.message.includes('expired') || e.message.includes('not found') || e.message.includes('404')) {
        db.prepare("UPDATE tasks SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(opp.id);
        results.closed++;
        results.lessons.push({ id: opp.id, title: opp.title, reason: e.message.slice(0, 100) });
        info('job-applicant', `opportunity #${opp.id} appears closed: ${opp.title}`);
      } else {
        warn('job-applicant', `re-apply failed for #${opp.id}: ${e.message}`);
      }
    }
    
    await new Promise(r => setTimeout(r, 1500));
  }

  // Log lessons learned
  if (results.lessons.length) {
    audit('executor', 'old_opportunity_review', {
      reviewed: results.reviewed,
      reApplied: results.reApplied,
      closed: results.closed,
      lessons: results.lessons
    });
  }

  // Report via bot
  if (results.reviewed > 0) {
    sendMessageDetailed([
      `📋 مراجعة يومية للفرص القديمة`,
      `━━━━━━━━━━━━━━`,
      `🔍 تم مراجعة: ${results.reviewed} فرصة`,
      `🔄 أُعيد التقديم: ${results.reApplied}`,
      `❌ منتهية/مغلقة: ${results.closed}`,
      results.lessons.length ? "\n📝 دروس مستفادة:" : '',
      ...results.lessons.map(l => `  • ${l.title}: ${l.reason}`)
    ].filter(Boolean).join('\n'), config.telegramChatId).catch(() => {});
  }

  info('job-applicant', `old opportunity review: ${results.reviewed} reviewed, ${results.reApplied} re-applied, ${results.closed} closed`);
  return results;
}

// ── Start daily old-opportunity monitor ──
export function startOpportunityMonitor() {
  // Run every 24 hours
  const t = setInterval(() => {
    reApplyOldOpportunities().catch(e => warn('job-applicant', `old opp review failed: ${e.message}`));
  }, 24 * 60 * 60 * 1000);
  t.unref();
  info('job-applicant', 'old opportunity monitor started (daily)');
  return t;
}
