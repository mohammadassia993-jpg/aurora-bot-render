/**
 * opportunity-validation.js — validate opportunities before they are sent.
 *
 * Rule: reward > 0 AND working URL AND description > 100 chars.
 * Any opportunity failing these checks is rejected (never sent to the leader).
 */
import { info } from './logger.js';

const MIN_REWARD = 0;
const MIN_DESC_CHARS = 100;

export function validateOpportunity(opp = {}) {
  const reward = Number(opp.reward || opp.price || 0);
  if (!(reward > MIN_REWARD)) {
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
