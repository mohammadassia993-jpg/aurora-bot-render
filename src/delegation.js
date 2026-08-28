import { db } from './db.js';
import { audit } from './audit.js';
import { info, warn } from './logger.js';

const AGENT_ROLES = {
  aurora: { label: '🧠 أورورا (المنسق)', capabilities: ['coordinate', 'report', 'notify'] },
  planner: { label: '📋 المخطط', capabilities: ['plan', 'analyze', 'distribute'] },
  executor: { label: '⚙️ المنفذ', capabilities: ['execute', 'implement', 'deploy'] },
  reviewer: { label: '🔍 المراجع', capabilities: ['review', 'validate', 'audit'] },
  scout: { label: '📡 المستخبر', capabilities: ['research', 'monitor', 'discover'] }
};

const SENSITIVE_ACTIONS = [
  'contract_sign', 'payment_initiate', 'api_key_share',
  'external_account_create', 'real_money_transfer', 'data_deletion'
];

export function getDelegationStatus() {
  const agents = db.prepare(`
    SELECT assigned_agent as agent, status, COUNT(*) as count
    FROM tasks WHERE assigned_agent != '' AND assigned_agent IS NOT NULL
    GROUP BY assigned_agent, status ORDER BY assigned_agent, status
  `).all();

  const pendingApprovals = db.prepare(`
    SELECT a.id, a.kind, a.state, t.title, a.created_at
    FROM approvals a LEFT JOIN tasks t ON a.task_id = t.id
    WHERE a.state = 'pending' ORDER BY a.created_at DESC
  `).all();

  const recentActivity = db.prepare(`
    SELECT agent, created_at, success, quality_score
    FROM agent_runs WHERE created_at >= datetime('now','-24 hours')
    ORDER BY created_at DESC LIMIT 10
  `).all();

  const lines = [
    '🎯 حالة التفويض والوكلاء',
    '━━━━━━━━━━━━━━━',
    '',
    '👥 الوكلاء النشطون:',
    ...Object.entries(AGENT_ROLES).map(([key, role]) => {
      const agentTasks = agents.filter(a => a.agent === key);
      const total = agentTasks.reduce((s, a) => s + a.count, 0);
      const done = agentTasks.filter(a => a.status === 'done' || a.status === 'drafted').reduce((s, a) => s + a.count, 0);
      return `• ${role.label}: ${total} مهمة (${done} مكتملة)`;
    }),
    '',
    pendingApprovals.length ? '⏳ م沓بات بانتظار موافقة القائد:' : '✅ لا توجد م巴巴بات معلقة',
    ...pendingApprovals.map(a => `• #${a.id} [${a.kind}] ${a.title || 'مهمة'} — ${a.created_at}`),
    '',
    recentActivity.length ? '📊 نشاط آخر 24 ساعة:' : 'لا يوجد نشاط خلال 24 ساعة',
    ...recentActivity.slice(0, 5).map(a => `• ${a.agent}: ${a.success ? '✅' : '❌'} (جودة: ${a.quality_score || '-'})`)
  ];
  return lines.join('\n');
}

export function delegateTask(agentName, taskTitle, priority = 'normal') {
  const agent = AGENT_ROLES[agentName];
  if (!agent) return { error: `وكيل غير معروف: ${agentName}. الوكلاء المتاحون: ${Object.keys(AGENT_ROLES).join(', ')}` };

  const result = db.prepare(`
    INSERT INTO tasks(source, external_id, title, reward, currency, fit_score, status, risk, payload_json, assigned_agent)
    VALUES (?, ?, ?, 0, '', 70, 'delegated', ?, '{}', ?)
  `).run('delegation', `del-${Date.now()}`, taskTitle, priority === 'high' ? 'medium' : 'low', agentName);

  audit('aurora', 'task_delegated', { taskId: result.lastInsertRowid, agent: agentName, priority });
  info('delegation', `task delegated to ${agentName}: ${taskTitle}`);
  return { taskId: Number(result.lastInsertRowid), agent: agent.label, priority };
}

export function requestApproval(actionType, payload, taskId = null) {
  if (!SENSITIVE_ACTIONS.includes(actionType)) {
    return { autoApproved: true, reason: 'action_not_sensitive' };
  }

  const result = db.prepare(`
    INSERT INTO approvals(task_id, kind, state, payload_json)
    VALUES (?, ?, 'pending', ?)
  `).run(taskId, actionType, JSON.stringify(payload));

  audit('aurora', 'approval_requested', { approvalId: result.lastInsertRowid, action: actionType });
  return {
    approvalId: Number(result.lastInsertRowid),
    actionType,
    message: `⚠️ يتطلب موافقة القائد: ${actionType}\nرقم الطلب: #${result.lastInsertRowid}\nأرسل: /approve ${result.lastInsertRowid} yes أو no`
  };
}

export function decideApproval(approvalId, approved) {
  const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId);
  if (!row) return { error: 'approval_not_found' };
  if (row.state !== 'pending') return { error: 'already_decided', state: row.state };

  db.prepare("UPDATE approvals SET state = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(approved ? 'approved' : 'rejected', approvalId);

  audit('aurora', 'approval_decided', { approvalId, approved });
  return { approvalId, decision: approved ? 'approved' : 'rejected' };
}

export function getDelegationCommands() {
  return [
    '/delegate <وكيل> <مهمة> [أولوية] — تفويض مهمة لوكيل',
    '/delegation — حالة التفويض والوكلاء',
    '/approve <رقم> yes|no — قرار الموافقة',
    '/agents — قائمة الوكلاء وصلاحياتهم',
    '/pending — الم巴巴بات بانتظار الموافقة'
  ].join('\n');
}

export function getAgentList() {
  return Object.entries(AGENT_ROLES).map(([key, role]) =>
    `• ${role.label}\n  الصلاحيات: ${role.capabilities.join(', ')}`
  ).join('\n\n');
}

export function getPendingApprovals() {
  return db.prepare(`
    SELECT a.id, a.kind, a.state, a.payload_json, t.title, a.created_at
    FROM approvals a LEFT JOIN tasks t ON a.task_id = t.id
    WHERE a.state = 'pending' ORDER BY a.created_at DESC
  `).all();
}

export { AGENT_ROLES, SENSITIVE_ACTIONS };
