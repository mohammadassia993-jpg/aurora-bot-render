/**
 * command-center.js — Dashboard metrics + Daily report + Early alert system (Part 6 of 8)
 *
 * - Key metrics: success rate, task cost, human intervention rate, trust scores
 * - Daily report format for leader
 * - Early alert system (quality drop, budget overrun)
 */
import { db } from './db.js';
import { config } from './config.js';
import { getTrustScore, getRecentLessons, getAuditTrail } from './memory.js';
import { sendMessageDetailed } from './telegram.js';
import { info, warn } from './logger.js';

// ── Key Metrics ──
export function getKeyMetrics() {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
  const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString().slice(0, 19).replace('T', ' ');

  const taskStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'needs_revision' THEN 1 ELSE 0 END) as needs_revision,
      SUM(CASE WHEN status IN ('planning','executing','reviewing') THEN 1 ELSE 0 END) as in_progress,
      AVG(CASE WHEN status = 'done' THEN fit_score END) as avg_score
    FROM tasks WHERE created_at >= ?
  `).get(cutoff7d);

  const runStats = db.prepare(`
    SELECT
      COUNT(*) as total_runs,
      AVG(success) as success_rate,
      AVG(quality_score) as avg_quality,
      AVG(latency_ms) as avg_latency
    FROM agent_runs WHERE created_at >= ?
  `).get(cutoff24h);

  const agentRuns = db.prepare(`
    SELECT agent, COUNT(*) as runs, AVG(success) as success_rate,
           AVG(quality_score) as avg_quality
    FROM agent_runs WHERE created_at >= ? GROUP BY agent
  `).all(cutoff7d);

  const humanInterventions = db.prepare(`
    SELECT COUNT(*) as count FROM approvals
    WHERE created_at >= ? AND state = 'approved'
  `).get(cutoff7d);

  const errorCount = db.prepare(`
    SELECT COUNT(*) as count FROM errors
    WHERE created_at >= ? AND resolved = 0
  `).get(cutoff24h);

  const totalTasks = taskStats.total || 1;
  const successRate = Math.round(((taskStats.completed || 0) / totalTasks) * 100);
  const humanInterventionRate = Math.round(((humanInterventions.count || 0) / totalTasks) * 100);

  const trustScores = {};
  for (const agent of ['aurora', 'planner', 'executor', 'reviewer', 'scout']) {
    trustScores[agent] = getTrustScore(agent);
  }

  return {
    successRate,
    taskCost: Math.round((runStats.total_runs || 0) * 0.01 * 100) / 100,
    humanInterventionRate,
    trustScores,
    taskStats: {
      total: taskStats.total,
      completed: taskStats.completed || 0,
      needsRevision: taskStats.needs_revision || 0,
      inProgress: taskStats.in_progress || 0,
      avgScore: Math.round(taskStats.avg_score || 0)
    },
    runStats: {
      totalRuns: runStats.total_runs || 0,
      successRate: Math.round((runStats.success_rate || 0) * 100),
      avgQuality: Math.round(runStats.avg_quality || 0),
      avgLatency: Math.round(runStats.avg_latency || 0)
    },
    agentRuns,
    errors: errorCount.count || 0,
    timestamp: new Date().toISOString()
  };
}

// ── Daily Report ──
export function generateDailyReport() {
  const metrics = getKeyMetrics();
  const recentLessons = getRecentLessons('global', 5);
  const recentAudit = getAuditTrail(null, 10);

  const agentLines = metrics.agentRuns.map(a =>
    `  • ${a.agent}: ${a.runs} تشغيلات (${Math.round((a.success_rate || 0) * 100)}% نجاح)`
  ).join('\n');

  const trustLines = Object.entries(metrics.trustScores).map(([agent, t]) =>
    `  • ${agent}: ${Math.round(t.avgTrust)}/100 (${t.entries} عينة)`
  ).join('\n');

  const lessonLines = recentLessons.map(l =>
    `  • [${l.lesson_type}] ${l.lesson_text.slice(0, 80)}`
  ).join('\n');

  return [
    `📊 التقرير اليومي — ${new Date().toLocaleDateString('ar-SA')}`,
    '━━━━━━━━━━━━━━━',
    '',
    '📈 المقاييس الرئيسية:',
    `  • معدل الإنجاز: ${metrics.successRate}%`,
    `  • المهام المكتملة: ${metrics.taskStats.completed}/${metrics.taskStats.total}`,
    `  • مهام تحتاج مراجعة: ${metrics.taskStats.needsRevision}`,
    `  • مهام قيد التنفيذ: ${metrics.taskStats.inProgress}`,
    `  • متوسط درجة الجودة: ${metrics.taskStats.avgScore}/100`,
    `  • معدل التدخل البشري: ${metrics.humanInterventionRate}%`,
    `  • الأخطاء غير المحلولة: ${metrics.errors}`,
    '',
    '🤖 أداء الوكلاء (آخر 7 أيام):',
    agentLines || '  لا يوجد بيانات',
    '',
    '🛡️ درجات الثقة:',
    trustLines || '  لا يوجد بيانات',
    '',
    recentLessons.length ? '📚 الدروس المستفادة:' : '',
    lessonLines,
    '',
    '📝 آخر الأنشطة:',
    ...recentAudit.slice(0, 5).map(a => `  • ${a.agent}: ${a.action} (${a.resource})`),
    '',
    `⏰ التحديث: ${new Date().toISOString()}`
  ].filter(Boolean).join('\n');
}

// ── Early Alert System ──
const ALERT_THRESHOLDS = {
  qualityDrop: 60,
  budgetOverrun: 0.8,
  highErrorRate: 0.3,
  lowSuccessRate: 0.5,
  trustDrop: 40
};

let lastAlertTime = {};
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

function shouldAlert(alertType) {
  const last = lastAlertTime[alertType] || 0;
  if (Date.now() - last < ALERT_COOLDOWN_MS) return false;
  lastAlertTime[alertType] = Date.now();
  return true;
}

export function checkAlerts() {
  const alerts = [];
  const metrics = getKeyMetrics();

  if (metrics.taskStats.avgScore < ALERT_THRESHOLDS.qualityDrop && metrics.taskStats.completed > 0) {
    if (shouldAlert('quality')) {
      alerts.push({
        type: 'quality_drop',
        severity: 'high',
        message: `⚠️ انخفاض الجودة: متوسط ${metrics.taskStats.avgScore}/100 (الحد: ${ALERT_THRESHOLDS.qualityDrop})`
      });
    }
  }

  if (metrics.successRate < ALERT_THRESHOLDS.lowSuccessRate * 100 && metrics.taskStats.total > 2) {
    if (shouldAlert('success')) {
      alerts.push({
        type: 'low_success',
        severity: 'high',
        message: `⚠️ معدل نجاح منخفض: ${metrics.successRate}% (الحد: ${ALERT_THRESHOLDS.lowSuccessRate * 100}%)`
      });
    }
  }

  if (metrics.errors > 5) {
    if (shouldAlert('errors')) {
      alerts.push({
        type: 'high_errors',
        severity: 'medium',
        message: `⚠️ ارتفاع الأخطاء: ${metrics.errors} أخطاء غير محلولة`
      });
    }
  }

  for (const [agent, trust] of Object.entries(metrics.trustScores)) {
    if (trust.avgTrust < ALERT_THRESHOLDS.trustDrop && trust.entries > 3) {
      if (shouldAlert(`trust_${agent}`)) {
        alerts.push({
          type: 'trust_drop',
          severity: 'medium',
          message: `⚠️ انخفاض ثقة الوكيل ${agent}: ${Math.round(trust.avgTrust)}/100`
        });
      }
    }
  }

  return alerts;
}

export function sendAlerts() {
  const alerts = checkAlerts();
  if (!alerts.length) return { sent: 0 };

  const alertText = [
    '🚨 تنبيهات النظام المبكر',
    '━━━━━━━━━━━━━━━',
    ...alerts.map(a => `${a.severity === 'high' ? '🔴' : '🟡'} ${a.message}`),
    '',
    `⏰ ${new Date().toISOString()}`
  ].join('\n');

  if (config.telegramToken && config.telegramChatId) {
    sendMessageDetailed(alertText, config.telegramChatId).catch(e =>
      warn('command-center', `alert send failed: ${e.message}`)
    );
  }

  return { sent: alerts.length, alerts };
}

// ── Command Center Status ──
export function getCommandCenterStatus() {
  const metrics = getKeyMetrics();
  const alerts = checkAlerts();
  return {
    metrics,
    alerts,
    thresholds: ALERT_THRESHOLDS,
    systemHealth: metrics.errors < 3 && metrics.successRate > 70 ? 'healthy' : 'degraded'
  };
}
