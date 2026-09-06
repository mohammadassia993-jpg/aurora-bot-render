import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { audit } from './audit.js';
import { info, warn } from './logger.js';
import { config } from './config.js';
import { verifyDCT, attenuateDCT, inspectDCT, getRevocationIds } from 'delegate-os';
import { InMemoryRevocationList, createRevocationEntry, cascadeRevoke } from 'delegate-os';
import {
  setupDelegation, getAgentDCT, getAgentKeypair, getRootKeypair,
  getManifest, AGENT_DEFS
} from './delegate-setup.js';

const AGENTS_DIR = path.join(config.root, 'data', 'agents');
const REVOCATION_FILE = path.join(AGENTS_DIR, 'revocation-list.json');

let revocationList = null;
let delegationReady = false;

function loadRevocationList() {
  try {
    if (fs.existsSync(REVOCATION_FILE)) {
      const json = fs.readFileSync(REVOCATION_FILE, 'utf8');
      revocationList = InMemoryRevocationList.fromJSON(json);
    } else {
      revocationList = new InMemoryRevocationList();
    }
  } catch (e) {
    warn('delegation', `failed to load revocation list: ${e.message}`);
    revocationList = new InMemoryRevocationList();
  }
}

function saveRevocationList() {
  try {
    fs.mkdirSync(path.dirname(REVOCATION_FILE), { recursive: true });
    fs.writeFileSync(REVOCATION_FILE, revocationList.toJSON(), { mode: 0o600 });
  } catch (e) {
    warn('delegation', `failed to save revocation list: ${e.message}`);
  }
}

export function initDelegation() {
  try {
    loadRevocationList();
    const result = setupDelegation();
    delegationReady = true;
    info('delegation', 'DelegateOS initialized', result);
    return result;
  } catch (e) {
    warn('delegation', `setup failed: ${e.message}`);
    delegationReady = false;
    return null;
  }
}

export function isDelegationReady() {
  return delegationReady;
}

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

export function verifyAgentAction(agentName, namespace, action, resource = '**') {
  if (!delegationReady) return { authorized: true, reason: 'delegateos_not_initialized' };

  const dct = getAgentDCT(agentName);
  if (!dct) return { authorized: false, reason: 'no_dct_found', agent: agentName };

  const revokedIds = revocationList.getRevocationIds();
  const context = {
    resource,
    namespace,
    operation: action,
    now: new Date().toISOString(),
    spentMicrocents: 0,
    rootPublicKey: getManifest()?.rootPrincipalId || '',
    revocationIds: revokedIds
  };

  const result = verifyDCT(dct, context);
  if (result.ok) {
    info('delegation', `DCT verified for ${agentName}: ${namespace}:${action}`);
    audit(agentName, 'dct_verified', { namespace, action, resource });
    return { authorized: true, scope: result.value };
  } else {
    warn('delegation', `DCT denied for ${agentName}: ${result.error.type}`);
    audit(agentName, 'dct_denied', { namespace, action, error: result.error.type });
    return { authorized: false, reason: result.error.type, detail: result.error };
  }
}

export function attenuateAgentToken(agentName, targetAgentName, allowedCapabilities, expiresHours = 24) {
  if (!delegationReady) return { error: 'delegateos_not_initialized' };

  const parentDct = getAgentDCT(agentName);
  if (!parentDct) return { error: 'no_parent_dct', agent: agentName };

  const parentKp = getAgentKeypair(agentName);
  if (!parentKp) return { error: 'no_parent_keypair', agent: agentName };

  const targetKp = getAgentKeypair(targetAgentName);
  if (!targetKp) return { error: 'no_target_keypair', targetAgent: targetAgentName };

  const parentMeta = inspectDCT(parentDct);
  if (parentMeta.chainDepth >= (parentMeta.maxChainDepth || 0)) {
    return { error: 'chain_depth_exceeded', max: parentMeta.maxChainDepth, current: parentMeta.chainDepth };
  }

  const expires = new Date(Date.now() + expiresHours * 3600_000);
  const childDct = attenuateDCT({
    token: parentDct,
    attenuator: parentKp,
    delegatee: targetKp.principal,
    delegationId: `del-${agentName}-${targetAgentName}-${Date.now()}`,
    contractId: `attenuation-${agentName}-to-${targetAgentName}`,
    allowedCapabilities,
    maxBudgetMicrocents: 50_000_000,
    expiresAt: expires.toISOString(),
    maxChainDepth: 0
  });

  const dctFile = path.join(AGENTS_DIR, 'dcts', `${targetAgentName}-child-${Date.now()}.dct.json`);
  fs.writeFileSync(dctFile, JSON.stringify(childDct, null, 2), { mode: 0o600 });

  audit(agentName, 'dct_attenuated', { target: targetAgentName, capabilities: allowedCapabilities });
  info('delegation', `DCT attenuated: ${agentName} → ${targetAgentName}`);
  return { success: true, childDct };
}

export function revokeAgentToken(agentName) {
  if (!delegationReady) return { error: 'delegateos_not_initialized' };

  const dct = getAgentDCT(agentName);
  if (!dct) return { error: 'no_dct_found', agent: agentName };

  const rootKp = getRootKeypair();
  const ids = getRevocationIds(dct);

  for (const rid of ids) {
    const entry = createRevocationEntry(rootKp, rid, 'chain');
    revocationList.addUnchecked(entry);
  }
  saveRevocationList();

  audit('commander', 'dct_revoked', { agent: agentName, revocationIds: ids });
  info('delegation', `DCT revoked for ${agentName}`, { ids: ids.length });
  return { success: true, revokedIds: ids, agent: agentName };
}

export function getRevocationStatus() {
  if (!revocationList) return { count: 0, ids: [] };
  return {
    count: revocationList.list().length,
    ids: revocationList.getRevocationIds(),
    entries: revocationList.list()
  };
}

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
    delegationReady ? '✅ DelegateOS: مفعّل' : '⚠️ DelegateOS: غير مفعّل',
    '',
    '👥 الوكلاء النشطون:'
  ];

  for (const [key, role] of Object.entries(AGENT_ROLES)) {
    const agentTasks = agents.filter(a => a.agent === key);
    const total = agentTasks.reduce((s, a) => s + a.count, 0);
    const done = agentTasks.filter(a => a.status === 'done' || a.status === 'drafted').reduce((s, a) => a.count, 0);
    const dctInfo = delegationReady ? getAgentDCT(key) : null;
    let dctLine = '';
    if (dctInfo) {
      try {
        const meta = inspectDCT(dctInfo);
        dctLine = ` [DCT: ${meta.capabilities.length} صلاحيات، عمق ${meta.chainDepth}/${meta.maxChainDepth}]`;
      } catch { dctLine = ' [DCT: ⚠️ خطأ]'; }
    }
    lines.push(`• ${role.label}: ${total} مهمة (${done} مكتملة)${dctLine}`);
  }

  lines.push('');

  if (pendingApprovals.length) {
    lines.push('⏳ مهام بانتظار موافقة القائد:');
    for (const a of pendingApprovals) {
      lines.push(`• #${a.id} [${a.kind}] ${a.title || 'مهمة'} — ${a.created_at}`);
    }
  } else {
    lines.push('✅ لا توجد مهام معلقة');
  }

  lines.push('');

  if (recentActivity.length) {
    lines.push('📊 نشاط آخر 24 ساعة:');
    for (const a of recentActivity.slice(0, 5)) {
      lines.push(`• ${a.agent}: ${a.success ? '✅' : '❌'} (جودة: ${a.quality_score || '-'})`);
    }
  } else {
    lines.push('لا يوجد نشاط خلال 24 ساعة');
  }

  const revStatus = getRevocationStatus();
  if (revStatus.count > 0) {
    lines.push('');
    lines.push(`🚫 توقيف (${revStatus.count}):`);
    for (const id of revStatus.ids.slice(0, 3)) {
      lines.push(`• ${id.slice(0, 12)}...`);
    }
  }

  return lines.join('\n');
}

export function delegateTask(agentName, taskTitle, priority = 'normal') {
  const agent = AGENT_ROLES[agentName];
  if (!agent) return { error: `وكيل غير معروف: ${agentName}. الوكلاء المتاحون: ${Object.keys(AGENT_ROLES).join(', ')}` };

  if (delegationReady) {
    const check = verifyAgentAction(agentName, 'task', 'create');
    if (!check.authorized) {
      return { error: `تم رفض التفويض: ${check.reason}. الوكيل ${agentName} ليس له صلاحية إنشاء مهام.` };
    }
  }

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

  if (delegationReady) {
    const check = verifyAgentAction('aurora', 'action', actionType);
    if (!check.authorized) {
      warn('delegation', `sensitive action denied: ${actionType}`);
    }
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
    '/delegation — حالة التفويض والوكلاء + DelegateOS',
    '/approve <رقم> yes|no — قرار الموافقة',
    '/agents — قائمة الوكلاء وصلاحياتهم',
    '/pending — المهام بانتظار الموافقة',
    '/revoke <وكيل> — إلغاء تفويض وكيل',
    '/dct <وكيل> — عرض رمز DCT لوكيل'
  ].join('\n');
}

export function getAgentList() {
  const manifest = getManifest();
  return Object.entries(AGENT_ROLES).map(([key, role]) => {
    let dctInfo = '';
    if (manifest?.agents?.[key]) {
      const a = manifest.agents[key];
      dctInfo = `\n  DCT Principal: ${a.principalId?.slice(0, 16)}...`;
      dctInfo += `\n  الصلاحيات المشفرة: ${a.capabilities?.length || 0}`;
      dctInfo += `\n  الحد المالي: $${((a.maxBudgetMicrocents || 0) / 100_000_000).toFixed(1)}`;
      dctInfo += `\n  عمق التفويض: ${a.maxChainDepth || 0}`;
    }
    return `• ${role.label}${dctInfo}\n  الصلاحيات: ${role.capabilities.join(', ')}`;
  }).join('\n\n');
}

export function getAgentDCTInfo(agentName) {
  if (!delegationReady) return '⚠️ DelegateOS غير مفعّل';
  const dct = getAgentDCT(agentName);
  if (!dct) return `❌ لا يوجد DCT للوكيل: ${agentName}`;
  const meta = inspectDCT(dct);
  const revStatus = getRevocationStatus();
  const isRevoked = revStatus.ids.some(id => meta.revocationIds.includes(id));
  return [
    `🔑 DCT — ${agentName}`,
    '━━━━━━━━━━━━━━━',
    `المُصدر: ${meta.issuer.slice(0, 16)}...`,
    `المفوّض: ${meta.delegatee.slice(0, 16)}...`,
    `عدد الصلاحيات: ${meta.capabilities.length}`,
    `ال Contract ID: ${meta.contractId}`,
    `ال Delegation ID: ${meta.delegationId}`,
    `الصعود: ${meta.chainDepth}/${meta.maxChainDepth}`,
    `الانتهاء: ${meta.expiresAt}`,
    '',
    'الصلاحيات:',
    ...meta.capabilities.map(c => `• ${c.namespace}:${c.action} → ${c.resource}`),
    '',
    isRevoked ? '🚫 تم التوقف' : '✅ ساري المفعول',
    '',
    `IDs الموقفة: ${meta.revocationIds.length}`
  ].join('\n');
}

export function getPendingApprovals() {
  return db.prepare(`
    SELECT a.id, a.kind, a.state, a.payload_json, t.title, a.created_at
    FROM approvals a LEFT JOIN tasks t ON a.task_id = t.id
    WHERE a.state = 'pending' ORDER BY a.created_at DESC
  `).all();
}

export { AGENT_ROLES, SENSITIVE_ACTIONS };
