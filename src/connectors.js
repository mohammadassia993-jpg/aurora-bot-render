import { config } from './config.js';
import { db, recordError } from './db.js';
import { info, warn } from './logger.js';
import { retry } from './retry.js';

function upsertTask(source, externalId, title, reward, currency, fitScore, risk, payload) {
  db.prepare(`
    INSERT INTO tasks(source, external_id, title, reward, currency, fit_score, risk, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      title = excluded.title, reward = excluded.reward, fit_score = excluded.fit_score,
      payload_json = excluded.payload_json, updated_at = CURRENT_TIMESTAMP
  `).run(source, externalId, title, reward, currency, fitScore, risk, JSON.stringify(payload));
}

export async function syncDework() {
  if (!config.deworkToken) {
    db.prepare("DELETE FROM tasks WHERE source='dework' AND external_id='dework-setup-required'").run();
    [
      ['simulation-dework-1', 'Simulated Dework: Arabic Web3 technical article', 250, 84],
      ['simulation-dework-2', 'Simulated Dework: protocol documentation translation', 180, 78]
    ].forEach(([externalId, title, reward, fitScore]) => upsertTask(
      'dework', externalId, title, reward, 'USD', fitScore, 'low',
      { simulation: true, workflow: ['plan', 'execute', 'review', 'human_approval'], live_submission: false }
    ));
    info('dework', 'simulation mode active with two safe workflow samples');
    return true;
  }
  warn('dework', 'Dework API endpoint must be supplied by an approved integration before live submissions.');
  return true;
}

export async function syncTitan() {
  if (!config.titanUrl) {
    db.prepare("DELETE FROM tasks WHERE source='titan' AND external_id='titan-setup-required'").run();
    [
      ['titan-sim-alpha', 'Simulated Titan node alpha', 'online', 92],
      ['titan-sim-beta', 'Simulated Titan node beta', 'degraded', 58]
    ].forEach(([id, name, status, fitScore]) => upsertTask(
      'titan', id, name, 0, '', fitScore, 'low',
      { simulation: true, status, cpu: status === 'online' ? '38%' : '81%', uptime: status === 'online' ? '99.2%' : '94.1%', alerts: [] }
    ));
    info('titan', 'simulation mode active with two synthetic nodes');
    return true;
  }

  try {
    const response = await retry(attempt => fetch(config.titanUrl, {
      headers: config.titanToken ? { authorization: `Bearer ${config.titanToken}` } : {}
    }), { delays: config.retryDelaysMs, scope: 'titan', onError: caught => recordError('titan', caught.code || 'TITAN_RETRY', caught.message, { attempt }) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const nodes = await response.json();
    const items = Array.isArray(nodes) ? nodes : nodes.nodes || [];
    for (const node of items) {
      upsertTask('titan', `titan:${node.id || node.name}`, node.name || node.id || 'Titan node', 0, '', node.status === 'online' ? 90 : 20, 'low', node);
    }
    info('titan', `Synced ${items.length} nodes`);
    return true;
  } catch (caught) {
    recordError('titan', caught.code || 'TITAN_HTTP', caught.message, {}, 'Retry with backoff');
    warn('titan', caught.message);
    return false;
  }
}

export async function syncJobs() {
  if (!config.jobFeedUrl) {
    upsertTask('jobs', 'jobs-setup-required', 'Configure JOB_FEED_URL to enable crypto job discovery', 0, '', 0, 'low', {
      blocked: true,
      next: 'Add a JSON or RSS job feed URL to .env.'
    });
    return false;
  }
  try {
    const response = await retry(attempt => fetch(config.jobFeedUrl), { delays: config.retryDelaysMs, scope: 'jobs', onError: caught => recordError('jobs', caught.code || 'JOB_RETRY', caught.message, { attempt }) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const feed = await response.json();
    const jobs = Array.isArray(feed) ? feed : feed.jobs || [];
    jobs.forEach((job, index) => upsertTask('jobs', job.id || `job-${index}`, job.title || 'Web3 role', job.salary || 0, job.currency || '', 70, 'low', job));
    return true;
  } catch (caught) {
    recordError('jobs', caught.code || 'JOB_HTTP', caught.message, {}, 'Retry later');
    return false;
  }
}

export async function syncOpportunities() {
  if (!config.opportunityFeedUrl) {
    [
      ['Arabic Web3 content program', 250],
      ['DePIN technical writing bounty', 180],
      ['Community translation grant', 300]
    ].forEach(([title, reward], index) => upsertTask('opportunity', `seed-opportunity-${index + 1}`, title, reward, 'USD', 78, 'low', { seeded: true }));
    return true;
  }
  try {
    const response = await retry(attempt => fetch(config.opportunityFeedUrl), { delays: config.retryDelaysMs, scope: 'opportunities', onError: caught => recordError('opportunities', caught.code || 'OPPORTUNITY_RETRY', caught.message, { attempt }) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const feed = await response.json();
    const opportunities = Array.isArray(feed) ? feed : feed.opportunities || [];
    opportunities.forEach((item, index) => upsertTask('opportunity', item.id || `opportunity-${index}`, item.title, item.reward || 0, item.currency || 'USD', item.fit_score || 70, item.risk || 'low', item));
    return true;
  } catch (caught) {
    recordError('opportunities', caught.code || 'OPPORTUNITY_HTTP', caught.message, {}, 'Retry later');
    return false;
  }
}

export async function runConnectors() {
  db.exec(`
    UPDATE tasks SET assigned_agent = CASE source
      WHEN 'dework' THEN 'executor'
      WHEN 'titan' THEN 'scout'
      WHEN 'jobs' THEN 'planner'
      WHEN 'opportunity' THEN 'scout'
      ELSE 'planner'
    END
    WHERE assigned_agent IS NULL OR assigned_agent = ''
  `);
  return {
    dework: await syncDework(),
    titan: await syncTitan(),
    jobs: await syncJobs(),
    opportunities: await syncOpportunities()
  };
}
