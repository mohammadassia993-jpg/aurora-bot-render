/**
 * hunter.js — Email finding + outreach via Hunter.io
 */
import { info, warn } from '../logger.js';
const KEY = process.env.HUNTER_API_KEY || '';
const BASE = 'https://api.hunter.io/v2';

export async function findEmails(domain) {
  if (!KEY) { warn('hunter', 'No HUNTER_API_KEY'); return []; }
  try {
    const res = await fetch(BASE + '/domain-search?domain=' + domain + '&api_key=' + KEY, { signal: AbortSignal.timeout(15000) });
    const data = await res.json();
    return (data.data?.emails || []).map(e => ({ email: e.value, name: e.first_name + ' ' + e.last_name, confidence: e.confidence }));
  } catch { return []; }
}

export async function sendSequence(email, subject, body) {
  if (!KEY) return { success: false, error: 'no_key' };
  try {
    const res = await fetch(BASE + '/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Silent Giants Outreach', api_key: KEY }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json();
    info('hunter', 'Sequence created: ' + data.data?.id);
    return { success: true, campaignId: data.data?.id };
  } catch (e) { return { success: false, error: e.message }; }
}

export default { findEmails, sendSequence };
