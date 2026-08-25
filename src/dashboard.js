import os from 'node:os';
import { db } from './db.js';
import { config } from './config.js';
import { AGENTS } from './team.js';
import { modelPerformance, availableModels } from './ai.js';
import { readPublicLink } from './tunnel.js';

export async function dashboardData() {
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
  const agents = AGENTS.map(agent => {
    if (agent.id === 'aurora') {
      return { ...agent, status: 'active', lastRunAt: new Date(Date.now() - process.uptime() * 1000).toISOString(), lastSuccess: true };
    }
    const row = db.prepare(`
      SELECT success, latency_ms, created_at FROM agent_runs
      WHERE agent=? ORDER BY id DESC LIMIT 1
    `).get(agent.id);
    return {
      ...agent,
      status: row && String(row.created_at) >= cutoff ? 'active' : 'idle',
      lastRunAt: row?.created_at || '',
      lastSuccess: Boolean(row?.success)
    };
  });

  const projectRows = db.prepare(`
    SELECT source, COUNT(*) AS total,
           SUM(CASE WHEN status IN ('delivered','paid','submitted') THEN 1 ELSE 0 END) AS completed,
           MIN(assigned_agent) AS owner
    FROM tasks GROUP BY source
  `).all();
  const wanted = ['dework', 'titan', 'jobs', 'opportunity'];
  const projects = wanted.map(source => ({
    source,
    owner: projectRows.find(row => row.source === source)?.owner || '',
    total: projectRows.find(row => row.source === source)?.total || 0,
    completed: projectRows.find(row => row.source === source)?.completed || 0
  }));

  const finance = {
    earned: db.prepare("SELECT COALESCE(SUM(reward),0) AS value FROM tasks WHERE status IN ('paid','delivered')").get().value,
    pipeline: db.prepare("SELECT COALESCE(SUM(reward),0) AS value FROM tasks WHERE status NOT IN ('paid','delivered')").get().value,
    completedTasks: db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE status IN ('submitted','delivered','paid')").get().count,
    pendingTasks: db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE status IN ('discovered','planned','drafted','needs_revision')").get().count
  };

  const tunnel = await readPublicLink();
  const publicUrl = config.publicBaseUrl || tunnel.url || '';
  const events = [
    ...db.prepare('SELECT id, scope AS actor, error_type AS action, message AS detail, created_at FROM errors ORDER BY id DESC LIMIT 10').all(),
    ...db.prepare("SELECT id, sender AS actor, 'message' AS action, body AS detail, created_at FROM messages ORDER BY id DESC LIMIT 10").all(),
    ...db.prepare("SELECT id, symbol AS actor, 'wallet_event' AS action, amount AS detail, created_at FROM wallet_events ORDER BY id DESC LIMIT 10").all()
  ].sort((a,b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0,10);

  return {
    identity: { agent: 'Aurora', leader: 'Mohammad Abbas', email: config.officialEmail },
    system: {
      platform: `${os.platform()} ${os.arch()}`, uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024), port: config.port
    },
    agents, projects, finance,
    events,
    models: modelPerformance(),
    availableModels: availableModels(),
    notifications: { unread: db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read=0').get().count },
    research: db.prepare('SELECT cycle, created_at AS createdAt FROM research_reports ORDER BY id DESC LIMIT 1').get() || null,
    wallets: [
      { label: 'USDC Base', address: config.usdcBaseAddress },
      { label: 'USDC Solana', address: config.usdcSolanaAddress },
      { label: 'USDT TON', address: config.usdtTonAddress }
    ],
    links: {
      local: `http://127.0.0.1:${config.port}`,
      public: publicUrl ? `${publicUrl}/?key=${encodeURIComponent(config.teamUiToken)}` : ''
    }
  };
}
