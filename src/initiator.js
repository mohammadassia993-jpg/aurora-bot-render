/**
 * initiator.js — Initiator Agent (المبادر)
 *
 * Proactively discovers opportunities and creates tasks:
 * - Scans job platforms for Web3 opportunities
 * - Discovers competitions and bounties
 * - Learns from successful tasks and reuses patterns
 * - Creates new tasks without human orders
 */
import { db } from './db.js';
import { config } from './config.js';
import { callModel } from './ai.js';
import { info, warn } from './logger.js';
import { eventBus, EVENTS } from './event-bus.js';
import { EpisodicMemory, SemanticMemory, ProceduralMemory } from './persistent-memory.js';

class InitiatorAgent {
  constructor() {
    this.scanCount = 0;
    this.tasksCreated = 0;
  }

  /** Main opportunity scan — discovers new work */
  async scanOpportunities() {
    info('initiator', '🔍 Scanning for opportunities...');
    this.scanCount++;

    const context = EpisodicMemory.recent(10);
    const lessons = SemanticMemory.byDomain('initiator', 5);
    const procedures = ProceduralMemory.topProcedures(5);

    const prompt = `أنت وكيل المبادر في نظام عمالقة الصمت. مهمتك اكتشاف فرص عمل جديدة.

السياق:
- آخر المهام: ${context.map(t => `${t.title} [${t.outcome}]`).join(', ') || 'لا توجد'}
- الدروس المستفادة: ${lessons.map(l => `${l.topic}: ${l.content.slice(0, 80)}`).join(', ') || 'لا توجد'}
- الإجراءات الناجحة: ${procedures.map(p => `${p.procedure_name} (${(p.success_rate * 100).toFixed(0)}% نجاح)`).join(', ') || 'لا توجد'}

المجالات المستهدفة: Web3, DePIN, Blockchain, AI, Content Writing, Translation

المطلوب: اقترح 3-5 فرص عمل جديدة كـ JSON:
{"opportunities": [{"title": "...", "platform": "...", "reward": "...", "fit_score": 0.8, "action": "..."}]}

若有 أي درس من المهام السابقة ينطبق، استخدمه.`;

    try {
      const response = await callModel('initiator', prompt);
      const clean = String(response).replace(/```json|```/g, '').trim();
      const jsonMatch = clean.match(/\{[\s\S]*"opportunities"[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const opps = parsed.opportunities || [];

        for (const opp of opps) {
          this.createTask(opp);
        }

        info('initiator', `✅ Found ${opps.length} opportunities`);
        await eventBus.fire(EVENTS.OPPORTUNITY_DISCOVERED, { count: opps.length, source: 'initiator_scan' });
        return opps;
      }
    } catch (e) {
      warn('initiator', `Scan failed: ${e.message}`);
    }

    return [];
  }

  /** Scan for competitions and contracts */
  async scanCompetitions() {
    info('initiator', '🏆 Scanning competitions & contracts...');

    const prompt = `ابحث عن مسابقات وعقود Web3 و AI نشطة حالياً. أعطِ 3-5 نتائج كـ JSON:
{"competitions": [{"title": "...", "platform": "...", "prize": "...", "deadline": "...", "url": "..."}]}

المجالات: Solana, Render, Filecoin, DePIN, AI Agents, Content`;

    try {
      const response = await callModel('initiator', prompt);
      const clean = String(response).replace(/```json|```/g, '').trim();
      const jsonMatch = clean.match(/\{[\s\S]*"competitions"[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const comps = parsed.competitions || [];

        for (const comp of comps) {
          this.createTask({
            title: comp.title,
            platform: comp.platform,
            reward: comp.prize,
            fit_score: 0.7,
            action: 'competition_entry'
          });
        }

        info('initiator', `✅ Found ${comps.length} competitions`);
        return comps;
      }
    } catch (e) {
      warn('initiator', `Competition scan failed: ${e.message}`);
    }

    return [];
  }

  /** Create a task from discovered opportunity */
  createTask(opportunity) {
    const existing = db.prepare('SELECT id FROM tasks WHERE title = ?').get(opportunity.title);
    if (existing) {
      info('initiator', `Task already exists: ${opportunity.title.slice(0, 40)}`);
      return existing.id;
    }

    const result = db.prepare(`
      INSERT INTO tasks(source, title, reward, fit_score, status, payload_json)
      VALUES (?, ?, ?, ?, 'discovered', ?)
    `).run(
      opportunity.platform || 'initiator',
      opportunity.title,
      parseFloat(opportunity.reward) || 0,
      opportunity.fit_score || 0.5,
      JSON.stringify(opportunity)
    );

    this.tasksCreated++;
    const taskId = result.lastInsertRowid;

    info('initiator', `📋 Task created #${taskId}: ${opportunity.title.slice(0, 40)}`);

    // Record in episodic memory
    EpisodicMemory.record('task_discovered', 'initiator', taskId, opportunity.title, `Discovered on ${opportunity.platform || 'unknown'}`, 'success');

    // Fire event
    eventBus.fire(EVENTS.TASK_CREATED, {
      taskId,
      title: opportunity.title,
      agent: 'initiator',
      opportunity
    });

    return taskId;
  }

  /** Learn from successful tasks and update procedures */
  learnFromSuccess(taskId) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task || task.status !== 'done') return;

    const payload = JSON.parse(task.payload_json || '{}');
    if (payload.action) {
      const proc = ProceduralMemory.match(task.title);
      if (proc) {
        ProceduralMemory.recordOutcome(proc.procedure_name, true);
      } else {
        // Register new procedure from successful task
        ProceduralMemory.register(
          task.title.slice(0, 30),
          `auto_${task.source}_${Date.now()}`,
          [{ step: 'discover', source: task.source }, { step: 'execute', title: task.title }]
        );
      }
    }

    // Store lesson in semantic memory
    if (payload.platform) {
      SemanticMemory.store('initiator', `${payload.platform}_success`, `Task "${task.title}" succeeded on ${payload.platform}`, 0.7);
    }
  }

  /** Get initiator stats */
  getStats() {
    const discovered = db.prepare("SELECT COUNT(*) c FROM tasks WHERE source = 'initiator'").get();
    const done = db.prepare("SELECT COUNT(*) c FROM tasks WHERE source = 'initiator' AND status = 'done'").get();
    return {
      scanCount: this.scanCount,
      tasksCreated: this.tasksCreated,
      totalDiscovered: discovered.c,
      totalCompleted: done.c
    };
  }
}

export const initiator = new InitiatorAgent();
export default initiator;
