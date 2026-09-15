/**
 * vigil-hooks.js — Automatic failure hooks for VIGIL
 *
 * Call these helpers from any module when a failure is detected:
 *   import { vigilDiagnose, vigilApplyStrategy } from './vigil-hooks.js'
 *
 * Usage:
 *   const failure = await vigilDiagnose(caughtError, scope);
 *   if (failure) await vigilApplyStrategy(failure);
 */
import fs from 'node:fs';
import path from 'node:path';
import { VigilSupervisor } from './self-healing-supervisor.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const MISTAKES_FILE = path.join(ROOT, 'data', 'mistakes.json');
let vigil = null;

function getVigil() {
  if (!vigil) {
    vigil = new VigilSupervisor({ intervalMs: 60_000, stallThresholdMs: 300_000 });
  }
  return vigil;
}

function updateMistakes(entry) {
  try {
    let mistakes = [];
    try { mistakes = JSON.parse(fs.readFileSync(MISTAKES_FILE, 'utf8')); } catch { /* empty */ }
    if (!Array.isArray(mistakes)) mistakes = [];
    mistakes.push({
      time: new Date().toISOString(),
      ruleId: entry.ruleId,
      rule: entry.rule,
      action: entry.action,
      message: String(entry.message || '').slice(0, 300),
      scope: entry.scope,
      suggestedFix: entry.description,
      resolved: false,
    });
    fs.writeFileSync(MISTAKES_FILE, JSON.stringify(mistakes, null, 2));
    return true;
  } catch (caught) {
    console.warn('[vigil-hooks] mistakes update failed:', caught.message);
    return false;
  }
}

export async function vigilDiagnose(failure) {
  const s = getVigil();
  const message = String(failure?.message || failure || '');
  const scope = failure?.scope || 'unknown';
  const recentFailures = [
    { time: new Date().toISOString(), message, scope, outcome: 'failed' }
  ];
  // Use the supervisor's classifier
  const recovery = s._classifyRecovery(message);
  return {
    ok: true,
    time: new Date().toISOString(),
    scope,
    message,
    recovery,
    recommendation: recovery.action,
  };
}

export async function vigilApplyStrategy(failure) {
  const s = getVigil();
  const result = await s._executeRecovery(failure.recovery, [{
    time: failure.time,
    message: failure.message,
    scope: failure.scope,
    outcome: 'failed'
  }]);

  // Record in mistakes.json
  const mistakesUpdated = updateMistakes({
    ...failure.recovery,
    message: failure.message,
    scope: failure.scope,
    time: failure.time,
  });

  // Make sure VIGIL itself keeps running (NEVER_STOP: no stall tolerated)
  if (!s.running) s.start();

  return { ...result, mistakesUpdated };
}

export async function vigilCheckNow() {
  const s = getVigil();
  return s._tick();
}

export { getVigil };
