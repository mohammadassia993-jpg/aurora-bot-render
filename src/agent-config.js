/**
 * agent-config.js — Agent identity, models, capabilities, and constraints
 * Part 1 of 8: Agent Structure
 */
import path from 'node:path';
import { config } from './config.js';
import { info } from './logger.js';

export const AGENT_PROFILES = {
  aurora: {
    id: 'aurora',
    label: '🧠 أورورا (المنسق)',
    description: 'المنسقة الرئيسية — توزع المهام وتتابع التنفيذ وتبلغ القائد',
    primaryModel: config.aiPrimaryModel || config.agnesModel || 'deepseek-chat',
    fallbackModel: config.deepSeekModel || 'deepseek-chat',
    allowedTasks: [
      'coordinate', 'report', 'notify', 'delegate', 'monitor',
      'approve', 'reject', 'escalate', 'daily_digest', 'task_routing'
    ],
    forbiddenTasks: [
      'execute_code', 'deploy_production', 'sign_contracts',
      'transfer_funds', 'create_external_accounts', 'delete_data'
    ],
    budgetMicrocents: 1_000_000_000,
    maxChainDepth: 3,
    maxConcurrentTasks: 10,
    timeoutMinutes: 30,
    escalationPolicy: 'immediate_to_leader',
    qualityThreshold: 85
  },
  planner: {
    id: 'planner',
    label: '📋 المخطط',
    description: 'مخطط المهام — يحلل الطلبات ويضع خطوات التنفيذ ويحدد الأولويات',
    primaryModel: config.deepSeekModel || 'deepseek-chat',
    fallbackModel: config.siliconFlowModel || 'deepseek-chat',
    allowedTasks: [
      'plan', 'analyze', 'distribute', 'estimate', 'prioritize',
      'breakdown', 'risk_assessment', 'timeline', 'resource_allocation'
    ],
    forbiddenTasks: [
      'execute_code', 'deploy', 'sign_contracts', 'transfer_funds',
      'external_account_create', 'send_emails', 'publish_content'
    ],
    budgetMicrocents: 100_000_000,
    maxChainDepth: 1,
    maxConcurrentTasks: 5,
    timeoutMinutes: 15,
    escalationPolicy: 'to_aurora',
    qualityThreshold: 80
  },
  executor: {
    id: 'executor',
    label: '⚙️ المنفذ',
    description: 'منفذ المهام — ينفّذ خطوات التنفيذ الفعلية ويسجّل الأخطاء والدروس',
    primaryModel: config.deepSeekModel || 'deepseek-chat',
    fallbackModel: config.agnesModel || 'deepseek-chat',
    allowedTasks: [
      'execute', 'implement', 'deploy', 'code', 'test',
      'email_send', 'platform_create_account', 'publish',
      'captcha_solve', 'otp_generate', 'sms_verify',
      'browser_automate', 'file_create', 'api_call'
    ],
    forbiddenTasks: [
      'sign_contracts', 'transfer_funds', 'delete_production_data',
      'external_account_create_without_approval', 'modify_root_config'
    ],
    budgetMicrocents: 200_000_000,
    maxChainDepth: 1,
    maxConcurrentTasks: 3,
    timeoutMinutes: 60,
    escalationPolicy: 'to_aurora',
    qualityThreshold: 75
  },
  reviewer: {
    id: 'reviewer',
    label: '🔍 المراجع',
    description: 'مراجع الجودة — يراجع كل تسليم ويتأكد من الجودة والسلامة',
    primaryModel: config.agnesModel || 'deepseek-chat',
    fallbackModel: config.deepSeekModel || 'deepseek-chat',
    allowedTasks: [
      'review', 'validate', 'audit', 'score', 'check_quality',
      'verify_output', 'compare_standards', 'suggest_improvements'
    ],
    forbiddenTasks: [
      'execute', 'deploy', 'modify_production', 'sign_contracts',
      'transfer_funds', 'create_external_accounts'
    ],
    budgetMicrocents: 50_000_000,
    maxChainDepth: 0,
    maxConcurrentTasks: 5,
    timeoutMinutes: 10,
    escalationPolicy: 'to_aurora',
    qualityThreshold: 90
  },
  scout: {
    id: 'scout',
    label: '📡 المستخبر',
    description: 'المستخبر — يبحث عن فرص جديدة ويراقب السوق ويكتشف القنوات',
    primaryModel: config.deepSeekModel || 'deepseek-chat',
    fallbackModel: config.agnesModel || 'deepseek-chat',
    allowedTasks: [
      'research', 'monitor', 'discover', 'web_search', 'analyze_trends',
      'track_opportunities', 'scan_platforms', 'discover_channels',
      'competitive_intel', 'market_analysis'
    ],
    forbiddenTasks: [
      'execute_code', 'deploy', 'sign_contracts', 'transfer_funds',
      'create_external_accounts', 'send_emails', 'publish_content'
    ],
    budgetMicrocents: 100_000_000,
    maxChainDepth: 1,
    maxConcurrentTasks: 5,
    timeoutMinutes: 20,
    escalationPolicy: 'to_aurora',
    qualityThreshold: 70
  }
};

export function getAgentProfile(agentId) {
  return AGENT_PROFILES[agentId] || null;
}

export function isTaskAllowed(agentId, taskType) {
  const profile = AGENT_PROFILES[agentId];
  if (!profile) return false;
  return profile.allowedTasks.includes(taskType);
}

export function isTaskForbidden(agentId, taskType) {
  const profile = AGENT_PROFILES[agentId];
  if (!profile) return true;
  return profile.forbiddenTasks.includes(taskType);
}

export function getAgentPromptPrefix(agentId) {
  const profile = AGENT_PROFILES[agentId];
  if (!profile) return '';
  return [
    `أنت ${profile.label}.`,
    `${profile.description}.`,
    `المهام المسموح بها: ${profile.allowedTasks.join(', ')}.`,
    `المهام الممنوعة: ${profile.forbiddenTasks.join(', ')}.`,
    `عتبة الجودة: ${profile.qualityThreshold}/100.`,
    `الحد الأقصى للمهام المتزامنة: ${profile.maxConcurrentTasks}.`,
    `انتهاء الصلاحية: ${profile.timeoutMinutes} دقيقة.`
  ].join('\n');
}

export function listAllAgents() {
  return Object.entries(AGENT_PROFILES).map(([id, p]) => ({
    id,
    label: p.label,
    description: p.description,
    allowedCount: p.allowedTasks.length,
    forbiddenCount: p.forbiddenTasks.length,
    budget: `$${(p.budgetMicrocents / 100_000_000).toFixed(1)}`,
    chainDepth: p.maxChainDepth,
    qualityThreshold: p.qualityThreshold
  }));
}

info('agent-config', 'agent profiles loaded', { count: Object.keys(AGENT_PROFILES).length });
