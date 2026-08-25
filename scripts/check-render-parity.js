const baseUrl = String(process.argv[2] || process.env.AURORA_BACKUP_URL || '').replace(/\/$/, '');
const teamKey = process.env.TEAM_UI_TOKEN || '';

if (!baseUrl) {
  console.error('usage: node scripts/check-render-parity.js https://service.onrender.com');
  process.exit(2);
}

async function getJson(pathname) {
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      headers: teamKey ? { 'x-team-key': teamKey } : {},
      signal: AbortSignal.timeout(30_000)
    });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : null;
    return { pathname, status: response.status, contentType, body };
  } catch (error) {
    return { pathname, status: 0, contentType: '', error: error.message };
  }
}

const [health, report, dashboard] = await Promise.all([
  getJson('/health'),
  getJson('/report'),
  getJson('/api/dashboard')
]);

const checks = {
  healthReachable: health.status === 200 && Boolean(health.body?.ok),
  healthComponents: ['gateway', 'internet', 'telegram', 'ai', 'memory', 'disk']
    .every(name => name in (health.body?.health || {})),
  reportIsJson: report.status === 200 && Boolean(report.body),
  reportHasUnifiedData: Boolean(report.body?.services && report.body?.agents && report.body?.dailyReport),
  dashboardReachable: dashboard.status === 200 && Boolean(dashboard.body),
  dashboardHasTeamData: Boolean(dashboard.body?.identity && dashboard.body?.agents && dashboard.body?.projects),
  dashboardHasPerformance: Boolean(dashboard.body?.performance)
};

const result = {
  checkedAt: new Date().toISOString(),
  target: baseUrl,
  parity: Object.values(checks).every(Boolean),
  checks,
  responses: { health, report: { ...report, body: report.body ? 'json-body-present' : null }, dashboard: { ...dashboard, body: dashboard.body ? 'json-body-present' : null } }
};

console.log(JSON.stringify(result, null, 2));
if (process.argv[3]) await import('node:fs/promises').then(fs => fs.writeFile(process.argv[3], `${JSON.stringify(result, null, 2)}\n`));
process.exitCode = result.parity ? 0 : 1;
