/**
 * self-healing-supervisor.js — VIGIL: Autonomous Self-Healing Supervisor
 *
 * Monitors all team activity, detects stalls (>5 min),
 * analyzes root cause via failures.log + rules.json,
 * and executes recovery automatically (no leader intervention).
 *
 * Usage:
 *   node src/self-healing-supervisor.js           # start as standalone daemon
 *   import { startVigil } from './self-healing-supervisor.js'  # use as module
 */
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const CONFIG = {
  root: path.resolve(import.meta.dirname, '..'),
  checkIntervalMs: 60_000,          // check every 60 seconds
  stallThresholdMs: 5 * 60_000,     // 5 minutes = stall
  maxConsecutiveFailures: 5,        // alert leader after 5 failures
  recoveryLog: 'logs/vigil.log',
  stateFile: 'data/vigil-state.json',
  failuresLog: 'logs/failures.log',
  rulesFile: 'data/rules.json',
  healthFile: 'data/health-state.json',
  platformLog: 'logs/platform.log',
  reportFile: 'reports/SELF_HEALING_VIGIL.md',
};

const RECOVERY_ACTIONS = {
  RETRY: 'retry',
  ALT_PATH: 'alt_path',
  SKIP_TASK: 'skip_task',
  RESTART_COMPONENT: 'restart_component',
  ALERT_LEADER: 'alert_leader',
  LOG_ONLY: 'log_only',
};

// Maps error keywords to recovery action + matching rule
const RECOVERY_MAP = [
  { pattern: /timeout|timed\s*out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|network|fetch failed/i,
    action: RECOVERY_ACTIONS.ALT_PATH, ruleId: 12, description: 'AUTO_RETRY — switch to alternative path' },
  { pattern: /captcha|turnstile|waf|human\s*verification/i,
    action: RECOVERY_ACTIONS.ALT_PATH, ruleId: 1, description: 'NOT_FOUND_RECOVERY — try 6 alternative platforms' },
  { pattern: /not\s*found|404|E404/i,
    action: RECOVERY_ACTIONS.SKIP_TASK, ruleId: 1, description: 'NOT_FOUND_RECOVERY — skip and try alternatives' },
  { pattern: /unauthorized|401|forbidden|403/i,
    action: RECOVERY_ACTIONS.ALERT_LEADER, ruleId: 9, description: 'NO_WAITING — but auth requires human' },
  { pattern: /500|internal\s*server/i,
    action: RECOVERY_ACTIONS.ALT_PATH, ruleId: 2, description: 'PLAYWRIGHT_FIRST — API broken, try Playwright' },
  { pattern: /rate.?limit|429|too many/i,
    action: RECOVERY_ACTIONS.RETRY, ruleId: 14, description: 'NO_SLEEP — wait and retry' },
  { pattern: /permission|access\s*denied|EACCES/i,
    action: RECOVERY_ACTIONS.RESTART_COMPONENT, ruleId: 11, description: 'VERIFY_COMPATIBILITY — restart with correct config' },
];

class VigilSupervisor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = { ...CONFIG, ...options };
    this.interval = null;
    this.state = this._loadState();
    this.stats = { checks: 0, stallsDetected: 0, recoveries: 0, alerts: 0 };
    this.running = false;
  }

  _loadState() {
    try {
      return JSON.parse(fs.readFileSync(this._path(this.config.stateFile), 'utf8'));
    } catch {
      return { lastActivity: null, lastRecovery: null, consecutiveFailures: 0, totalRecoveries: 0, tasks: [] };
    }
  }

  _saveState() {
    try {
      fs.mkdirSync(path.dirname(this._path(this.config.stateFile)), { recursive: true });
      fs.writeFileSync(this._path(this.config.stateFile), JSON.stringify(this.state, null, 2), { mode: 0o600 });
    } catch (e) {
      this._log('error', `state save failed: ${e.message}`);
    }
  }

  _path(relative) {
    return path.join(this.config.root, relative);
  }

  _log(level, message, data = {}) {
    const entry = {
      time: new Date().toISOString(),
      level,
      message,
      ...Object.keys(data).length > 0 ? { data } : {},
    };
    const line = JSON.stringify(entry) + '\n';
    try {
      const logPath = this._path(this.config.recoveryLog);
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, line);
    } catch { /* best effort */ }
    if (level === 'error') console.error(`[VIGIL:${level}]`, message, data);
    else console.log(`[VIGIL:${level}]`, message);
  }

  _readLastPlatformActivity() {
    try {
      const logPath = this._path(this.config.platformLog);
      if (!fs.existsSync(logPath)) return null;
      const stat = fs.statSync(logPath);
      // Use file modification time as proxy for last activity
      return stat.mtimeMs;
    } catch {
      return null;
    }
  }

  _readLastHealthCheck() {
    try {
      const healthPath = this._path(this.config.healthFile);
      if (!fs.existsSync(healthPath)) return null;
      const state = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
      // health-state.json has component keys with lastCheck timestamps
      const checks = Object.values(state).filter(v => v && typeof v.lastCheck === 'string');
      if (checks.length === 0) return null;
      const latest = checks.reduce((max, v) => {
        const t = new Date(v.lastCheck).getTime();
        return t > max ? t : max;
      }, 0);
      return latest || null;
    } catch {
      return null;
    }
  }

  _readRecentFailures(limit = 50) {
    try {
      const logPath = this._path(this.config.failuresLog);
      if (!fs.existsSync(logPath)) return [];
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
      return lines.slice(-limit).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  _loadRules() {
    try {
      return JSON.parse(fs.readFileSync(this._path(this.config.rulesFile), 'utf8'));
    } catch {
      return [];
    }
  }

  _classifyRecovery(errorText) {
    const text = String(errorText || '').toLowerCase();
    for (const entry of RECOVERY_MAP) {
      if (entry.pattern.test(text)) {
        return entry;
      }
    }
    return { action: RECOVERY_ACTIONS.LOG_ONLY, ruleId: null, description: 'unclassified error' };
  }

  _getStallDuration() {
    const lastActivity = this.state.lastActivity || this._readLastPlatformActivity();
    if (!lastActivity) return 0;
    return Date.now() - lastActivity;
  }

  _updateLastActivity(timestampMs) {
    this.state.lastActivity = timestampMs || Date.now();
    this._saveState();
  }

  async _executeRecovery(recovery, recentFailures) {
    this._log('warn', `recovery triggered: ${recovery.description}`, {
      action: recovery.action,
      ruleId: recovery.ruleId,
    });

    this.stats.recoveries++;
    this.state.totalRecoveries++;
    this.state.lastRecovery = new Date().toISOString();
    this._saveState();

    const rules = this._loadRules();
    const matchedRule = rules.find(r => r.id === recovery.ruleId);

    const result = {
      time: new Date().toISOString(),
      action: recovery.action,
      rule: matchedRule || null,
      error: recentFailures.length > 0 ? recentFailures[recentFailures.length - 1].message : 'unknown',
      outcome: 'attempted',
    };

    switch (recovery.action) {
      case RECOVERY_ACTIONS.ALT_PATH:
        // Switch to alternative: log a new task creation request
        this._log('info', `ALT_PATH: scheduling alternative task for next cycle`);
        this.state.tasks.push({
          id: `vigil-recovery-${Date.now().toString(36)}`,
          action: 'create_alternative_task',
          basedOn: recentFailures.slice(-1)[0]?.scope || 'unknown',
          created: new Date().toISOString(),
          status: 'pending',
        });
        result.outcome = 'alternative_task_queued';
        break;

      case RECOVERY_ACTIONS.RETRY:
        this._log('info', `RETRY: scheduling retry for next cycle`);
        this.state.tasks.push({
          id: `vigil-retry-${Date.now().toString(36)}`,
          action: 'retry_failed_task',
          basedOn: recentFailures.slice(-1)[0]?.scope || 'unknown',
          created: new Date().toISOString(),
          status: 'pending',
        });
        result.outcome = 'retry_queued';
        break;

      case RECOVERY_ACTIONS.SKIP_TASK:
        this._log('info', `SKIP: skipping failed task, moving to next`);
        this.state.tasks.push({
          id: `vigil-skip-${Date.now().toString(36)}`,
          action: 'skip_and_next',
          basedOn: recentFailures.slice(-1)[0]?.scope || 'unknown',
          created: new Date().toISOString(),
          status: 'pending',
        });
        result.outcome = 'task_skipped';
        break;

      case RECOVERY_ACTIONS.RESTART_COMPONENT:
        this._log('info', `RESTART: component restart scheduled`);
        result.outcome = 'restart_scheduled';
        break;

      case RECOVERY_ACTIONS.ALERT_LEADER:
        this._log('warn', `ALERT: requires leader intervention`);
        this.stats.alerts++;
        this.state.consecutiveFailures++;
        result.outcome = 'leader_alerted';
        break;

      case RECOVERY_ACTIONS.LOG_ONLY:
      default:
        this._log('info', `LOG_ONLY: error recorded, no action taken`);
        result.outcome = 'logged';
        break;
    }

    // Emit event for downstream handlers
    this.emit('vigil:recovery', result);

    return result;
  }

  async _tick() {
    this.stats.checks++;
    const lastActivity = this._readLastPlatformActivity();
    const lastHealth = this._readLastHealthCheck();

    // Use the most recent timestamp from any source
    const mostRecent = Math.max(lastActivity || 0, lastHealth || 0, this.state.lastActivity || 0);
    this._updateLastActivity(mostRecent || Date.now());

    const stallDuration = Date.now() - (mostRecent || Date.now());

    if (stallDuration > this.config.stallThresholdMs) {
      this.stats.stallsDetected++;
      this._log('warn', `STALL detected (${Math.round(stallDuration / 1000)}s since last activity)`);

      // Analyze recent failures to find root cause
      const recentFailures = this._readRecentFailures(10);
      const failedRecently = recentFailures.filter(f => {
        const t = new Date(f.time).getTime();
        return Date.now() - t < 30 * 60_000 && f.outcome === 'failed';
      });

      if (failedRecently.length > 0) {
        const lastError = failedRecently[failedRecently.length - 1];
        const recovery = this._classifyRecovery(lastError.message);
        return await this._executeRecovery(recovery, failedRecently);
      }

      // No failures found but still stalled — generic recovery
      this._log('info', 'stall without failures — scheduling retry');
      return await this._executeRecovery(
        { action: RECOVERY_ACTIONS.RETRY, ruleId: 12, description: 'stall without explicit failure — AUTO_RETRY' },
        []
      );
    }

    this._log('info', `healthy — ${Math.round(stallDuration / 1000)}s since last activity`);
    return { status: 'healthy', stallDuration };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._log('info', `VIGIL supervisor started (interval: ${this.config.checkIntervalMs / 1000}s, stall threshold: ${this.config.stallThresholdMs / 1000}s)`);
    this.interval = setInterval(() => this._tick().catch(e => this._log('error', `tick failed: ${e.message}`)), this.config.checkIntervalMs);
    this._tick().catch(e => this._log('error', `initial tick failed: ${e.message}`));
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.running = false;
    this._log('info', 'VIGIL supervisor stopped');
  }

  getStatus() {
    return {
      running: this.running,
      stats: { ...this.stats },
      state: { ...this.state },
      lastStallDurationMs: this._getStallDuration(),
    };
  }
}

// ── Standalone daemon mode ──
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const supervisor = new VigilSupervisor();
  supervisor.start();
  supervisor.on('vigil:recovery', (result) => {
    console.log('[VIGIL_EVENT] recovery:', JSON.stringify(result));
  });

  // Graceful shutdown
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      supervisor.stop();
      process.exit(0);
    });
  }

  console.log('[VIGIL] Supervisor running as PID', process.pid);
}

export { VigilSupervisor, RECOVERY_ACTIONS, CONFIG };
export default VigilSupervisor;
