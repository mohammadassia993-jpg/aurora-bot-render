/**
 * opportunity-validation.js — validate opportunities before they are sent.
 *
 * Rule: reward > 0 AND working URL AND description > 100 chars.
 * Any opportunity failing these checks is rejected (never sent to the leader).
 */
import { info } from './logger.js';

const MIN_REWARD = 0;
const MIN_DESC_CHARS = 100;

// Strict reward check: handles 0, "N/A", null, undefined, "", "0", and any non-numeric string.
export function hasValidReward(r) {
  if (r === null || r === undefined) return false;
  const s = String(r).trim();
  if (s === '' || s.toLowerCase() === 'n/a' || s === '0') return false;
  if (!/\d/.test(s)) return false;      // must contain at least one digit
  const num = Number(s.replace(/[^0-9.\-]/g, ''));
  return !Number.isNaN(num) && num > MIN_REWARD;
}

export function validateOpportunity(opp = {}) {
  const reward = opp.reward !== undefined ? opp.reward : opp.price;
  if (!hasValidReward(reward)) {
    return { ok: false, reason: 'zero_reward' };
  }
  const url = String(opp.url || opp.link || opp.source_url || '').trim();
  if (!url) {
    return { ok: false, reason: 'missing_url' };
  }
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, reason: 'invalid_url' };
  }
  const description = String(opp.description || opp.why || opp.details || opp.title || '').trim();
  if (description.length < MIN_DESC_CHARS) {
    return { ok: false, reason: 'short_description' };
  }
  return { ok: true, reason: '' };
}

export function filterValidOpportunities(list = []) {
  const valid = [];
  const rejected = [];
  for (const opp of list) {
    const verdict = validateOpportunity(opp);
    if (verdict.ok) valid.push(opp);
    else rejected.push({ opp, reason: verdict.reason });
  }
  if (rejected.length) {
    info('opportunity-validation', `filtered ${rejected.length} invalid opportunities`, {
      reasons: rejected.map(r => r.reason)
    });
  }
  return { valid, rejected };
}

export default validateOpportunity;
