import { db } from './db.js';
import { info, warn } from './logger.js';
import { audit } from './audit.js';

const WEB3_TAGS = /crypto|blockchain|web3|defi|nft|solana|ethereum|bitcoin|solidity|smart contract|dao/i;

function upsertReal(source, externalId, title, payload) {
  db.prepare(`
    INSERT INTO tasks(source, external_id, title, reward, currency, fit_score, risk, status, payload_json)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(external_id) DO UPDATE SET title=excluded.title, payload_json=excluded.payload_json, updated_at=CURRENT_TIMESTAMP
  `).run(source, externalId, title, payload.reward || 0, 'USD', payload.fit_score || 60, payload.risk || 'low', 'discovered', JSON.stringify(payload));
}

async function scanRemoteOk() {
  const res = await fetch('https://remoteok.com/api', { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('RemoteOK HTTP ' + res.status);
  const data = await res.json();
  if (!Array.isArray(data)) return 0;
  let added = 0;
  for (const job of data) {
    const pos = String(job.position || '');
    const tags = Array.isArray(job.tags) ? job.tags.join(' ') : String(job.tags || '');
    const company = String(job.company || '');
    if (!job.url || !pos) continue;
    if (!WEB3_TAGS.test(pos) && !WEB3_TAGS.test(tags) && !WEB3_TAGS.test(company)) continue;
    upsertReal('jobs', 'remoteok:' + job.id, pos, {
      source: 'RemoteOK', company, location: job.location || '',
      salary: job.salary_min ? `$${job.salary_min}-${job.salary_max || ''}` : '',
      tags: job.tags || [], url: job.url, detected_at: new Date().toISOString(), real: true
    });
    added++;
  }
  return added;
}

async function scanRemotive() {
  const res = await fetch('https://remotive.com/api/remote-jobs', { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('Remotive HTTP ' + res.status);
  const data = await res.json();
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  let added = 0;
  for (const job of jobs) {
    const title = String(job.title || '');
    const tags = String(job.tags || '');
    if (!job.url || !title) continue;
    if (!WEB3_TAGS.test(title) && !WEB3_TAGS.test(tags)) continue;
    upsertReal('jobs', 'remotive:' + job.id, title, {
      source: 'Remotive', company: job.company_name || '', location: job.candidate_required_location || '',
      salary: job.salary || '', tags: Array.isArray(job.tags) ? job.tags : [], url: job.url,
      detected_at: new Date().toISOString(), real: true
    });
    added++;
  }
  return added;
}

export async function scanRealOpportunities() {
  const purged = db.prepare("DELETE FROM tasks WHERE external_id LIKE 'research:%' AND source IN ('jobs','opportunity')").run().changes;
  const results = [];
  for (const scan of [scanRemoteOk, scanRemotive]) {
    try {
      const added = await scan();
      results.push({ source: scan.name, added });
    } catch (e) {
      warn('opportunity-scan', `${scan.name} failed: ${e.message}`);
      results.push({ source: scan.name, error: e.message });
    }
  }
  const total = results.reduce((s, r) => s + (r.added || 0), 0);
  info('opportunity-scan', `scan complete: purged=${purged} ${JSON.stringify(results)} total=${total}`);
  audit('executor', 'real_opportunity_scan', { purged, results, total });
  return { purged, total, results };
}

export default { scanRealOpportunities };
