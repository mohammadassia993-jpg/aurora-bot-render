/**
 * event-bus.js — Central Neural Event Bus
 *
 * Connects all agents via events:
 * - task:success → initiate new task
 * - task:failed → retry or change strategy
 * - review:complete → auto-publish if quality high
 * - budget:empty → alert leader
 * - opportunity:discovered → create task
 * - report:ready → send via bot
 */
import { EventEmitter } from 'node:events';
import { info, warn } from './logger.js';
import { EpisodicMemory, SemanticMemory } from './persistent-memory.js';

class NeuralEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this.handlers = new Map();
    this.eventLog = [];
    this.maxLogSize = 500;
  }

  /** Register an agent handler with pattern matching */
  onAgent(eventName, agentName, handler, priority = 0) {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName).push({ agentName, handler, priority });
    this.handlers.get(eventName).sort((a, b) => b.priority - a.priority);
    info('event-bus', `agent "${agentName}" subscribed to "${eventName}"`);
  }

  /** Emit event with logging and memory recording */
  async fire(eventName, payload = {}) {
    const event = {
      name: eventName,
      payload,
      timestamp: new Date().toISOString(),
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    };

    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }

    info('event-bus', `event fired: ${eventName}`, { id: event.id, payloadKeys: Object.keys(payload) });

    const handlers = this.handlers.get(eventName) || [];
    const results = [];

    for (const { agentName, handler } of handlers) {
      try {
        const result = await handler(payload, event);
        results.push({ agent: agentName, success: true, result });
        info('event-bus', `handler "${agentName}" completed for "${eventName}"`);
      } catch (err) {
        results.push({ agent: agentName, success: false, error: err.message });
        warn('event-bus', `handler "${agentName}" failed for "${eventName}": ${err.message}`);
      }
    }

    // Also emit to EventEmitter listeners
    this.emit(eventName, payload);

    return results;
  }

  /** Get recent event history */
  getLog(limit = 20) {
    return this.eventLog.slice(-limit);
  }

  /** Get stats about event processing */
  getStats() {
    const counts = {};
    for (const e of this.eventLog) {
      counts[e.name] = (counts[e.name] || 0) + 1;
    }
    return { totalEvents: this.eventLog.length, byType: counts };
  }
}

// ── Singleton ──
export const eventBus = new NeuralEventBus();

// ── Predefined Event Types ──
export const EVENTS = {
  // Task lifecycle
  TASK_DISCOVERED: 'task:discovered',
  TASK_CREATED: 'task:created',
  TASK_STARTED: 'task:started',
  TASK_SUCCESS: 'task:success',
  TASK_FAILED: 'task:failed',
  TASK_RETRY: 'task:retry',

  // Review
  REVIEW_COMPLETE: 'review:complete',
  REVIEW_APPROVED: 'review:approved',
  REVIEW_REJECTED: 'review:rejected',

  // Production
  PRODUCT_CREATED: 'product:created',
  PRODUCT_PUBLISHED: 'product:published',

  // Opportunity
  OPPORTUNITY_DISCOVERED: 'opportunity:discovered',
  OPPORTUNITY_APPLIED: 'opportunity:applied',

  // Budget
  BUDGET_LOW: 'budget:low',
  BUDGET_EMPTY: 'budget:empty',
  PAYMENT_RECEIVED: 'payment:received',

  // Reports
  REPORT_READY: 'report:ready',
  REPORT_DAILY: 'report:daily',

  // System
  SYSTEM_HEALTH: 'system:health',
  SYSTEM_ERROR: 'system:error',
  SYSTEM_ALERT: 'system:alert',

  // Memory
  LESSON_LEARNED: 'memory:lesson',
  PROCEDURE_UPDATED: 'memory:procedure'
};

// ── Built-in Event Chains ──
// When a task succeeds → record in memory + potentially create new task
eventBus.on(EVENTS.TASK_SUCCESS, async (payload) => {
  if (payload.title) {
    EpisodicMemory.record('task_complete', payload.agent || 'system', payload.taskId, payload.title, payload.summary || 'تم الإنجاز بنجاح', 'success');
  }
});

// When a task fails → record failure + log lesson
eventBus.on(EVENTS.TASK_FAILED, async (payload) => {
  if (payload.title) {
    EpisodicMemory.record('task_failed', payload.agent || 'system', payload.taskId, payload.title, payload.error || 'فشل', 'failed');
  }
  if (payload.lesson) {
    SemanticMemory.store('lessons', payload.lessonKey || `failure_${Date.now()}`, payload.lesson, 0.8);
  }
});

// When a lesson is learned → store in semantic memory
eventBus.on(EVENTS.LESSON_LEARNED, async (payload) => {
  if (payload.domain && payload.topic && payload.content) {
    SemanticMemory.store(payload.domain, payload.topic, payload.content, payload.confidence || 0.7);
  }
});


// ── Instant Alert Handlers ──
// When a sale happens → alert the leader immediately
eventBus.on(EVENTS.PAYMENT_RECEIVED, async (payload) => {
  try {
    const { sendMessageDetailed } = await import('./telegram.js');
    const { config } = await import('./config.js');
    const msg = [
      '💰 تقرير فوري — عملية بيع جديدة!',
      '',
      `  📦 المنتج: ${payload.product || 'غير معروف'}`,
      `  💵 المبلغ: $${payload.amount || '0'}`,
      `  🔗 المنصة: ${payload.platform || 'غير معروف'}`,
      `  ⏰ الوقت: ${new Date().toLocaleString('ar-EG')}`,
    ].join('\n');
    await sendMessageDetailed(msg, config.telegramChatId);
  } catch (e) { /* silent */ }
});

// When a prize is won → alert immediately
eventBus.on(EVENTS.TASK_SUCCESS, async (payload) => {
  if (payload.source === 'prize_scan' || payload.isPrize) {
    try {
      const { sendMessageDetailed } = await import('./telegram.js');
      const { config } = await import('./config.js');
      const msg = [
        '🎉 تقرير فوري — فوز بجائزة/عقد!',
        '',
        `  🏆 الجائزة: ${payload.title || 'غير معروف'}`,
        `  💵 المكافأة: ${payload.reward || 'غير معروف'}`,
        `  🔗 المنصة: ${payload.platform || 'غير معروف'}`,
        `  ⏰ الوقت: ${new Date().toLocaleString('ar-EG')}`,
      ].join('\n');
      await sendMessageDetailed(msg, config.telegramChatId);
    } catch (e) { /* silent */ }
  }
});

// When a contract is signed → alert immediately
eventBus.on(EVENTS.OPPORTUNITY_APPLIED, async (payload) => {
  if (payload.type === 'contract') {
    try {
      const { sendMessageDetailed } = await import('./telegram.js');
      const { config } = await import('./config.js');
      const msg = [
        '📝 تقرير فوري — توقيع عقد جديد!',
        '',
        `  📄 العقد: ${payload.title || 'غير معروف'}`,
        `  💵 القيمة: ${payload.value || 'غير معروف'}`,
        `  🔗 الجهة: ${payload.entity || 'غير معروف'}`,
        `  ⏰ الوقت: ${new Date().toLocaleString('ar-EG')}`,
      ].join('\n');
      await sendMessageDetailed(msg, config.telegramChatId);
    } catch (e) { /* silent */ }
  }
});

export default eventBus;

// ── FEEDBACK LOOP: task:success → create follow-up task ──
eventBus.on(EVENTS.TASK_SUCCESS, async (payload) => {
  // When a task succeeds, create a follow-up task automatically
  if (payload.followUpTask) {
    try {
      const { db } = await import('./db.js');
      db.prepare(`
        INSERT INTO tasks (title, description, source, status, priority, created_at)
        VALUES (?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)
      `).run(payload.followUpTask.title, payload.followUpTask.description || '', payload.followUpTask.source || 'feedback_loop', payload.followUpTask.priority || 'medium');
      info('event-bus', `feedback loop: created follow-up task "${payload.followUpTask.title}"`);
    } catch (e) {
      warn('event-bus', `feedback loop failed: ${e.message}`);
    }
  }
});

// ── FEEDBACK LOOP: product:published → create marketing task ──
eventBus.on(EVENTS.PRODUCT_PUBLISHED, async (payload) => {
  try {
    const { db } = await import('./db.js');
    db.prepare(`
      INSERT INTO tasks (title, description, source, status, priority, created_at)
      VALUES (?, ?, 'feedback_loop', 'pending', 'medium', CURRENT_TIMESTAMP)
    `).run(
      `تسويق المنتج: ${payload.name || 'منتج جديد'}`,
      `تم نشر المنتج "${payload.name || 'منتج جديد'}" على ${payload.platform || 'منصة'}. المطلوب: إنشاء منشورات تسويقية وتغريدات.`
    );
    info('event-bus', `feedback loop: created marketing task for "${payload.name}"`);
  } catch (e) {
    warn('event-bus', `marketing feedback loop failed: ${e.message}`);
  }
});

// ── FEEDBACK LOOP: opportunity:discovered → create application task ──
eventBus.on(EVENTS.OPPORTUNITY_DISCOVERED, async (payload) => {
  if (payload.autoApply) {
    try {
      const { db } = await import('./db.js');
      db.prepare(`
        INSERT INTO tasks (title, description, source, status, priority, created_at)
        VALUES (?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)
      `).run(
        `التقديم على: ${payload.title || 'فرصة جديدة'}`,
        payload.description || '',
        'auto_apply',
        payload.priority || 'medium'
      );
      info('event-bus', `feedback loop: created application task for "${payload.title}"`);
    } catch (e) {
      warn('event-bus', `application feedback loop failed: ${e.message}`);
    }
  }
});
