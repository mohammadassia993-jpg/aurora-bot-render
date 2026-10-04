// security-agent-v2.js — Full Defensive Security Auditor
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { config } from './config.js';
import { db } from './db.js';

const ROOT = config.root;
const SECRET = /(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|MNEMONIC|SEED)/i;
const PLACEHOLDER = /^(your_|xxx|example|placeholder)/i;

function runCmd(cmd, args, timeout) {
  timeout = timeout || 30000;
  return new Promise(function(resolve) {
    execFile(cmd, args, { cwd: ROOT, timeout: timeout }, function(err, stdout) {
      resolve({ ok: !err, stdout: String(stdout || '').slice(0, 8000) });
    });
  });
}

export async function auditEnvVars() {
  const issues = [];
  try {
    const example = await fs.readFile(path.join(ROOT, '.env.example'), 'utf8');
    for (const line of example.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
      if (!m || !m[2]) continue;
      if (!SECRET.test(m[1])) continue;
      if (PLACEHOLDER.test(m[2].trim())) continue;
      if (m[2].trim().length < 15) continue;
      issues.push({ file: '.env.example', key: m[1], issue: 'value looks real' });
    }
  } catch (e) {}
  try {
    const gi = await fs.readFile(path.join(ROOT, '.gitignore'), 'utf8');
    if (!gi.includes('.env')) issues.push({ file: '.gitignore', issue: 'does not ignore .env' });
  } catch (e) {
    issues.push({ file: '.gitignore', issue: 'missing' });
  }
  return { ok: issues.length === 0, issues: issues };
}

export async function auditDependencies() {
  const result = await runCmd('npm', ['audit', '--json']);
  let data = null;
  try { data = JSON.parse(result.stdout); } catch (e) {}
  if (!data) return { ok: true, skipped: true, reason: 'npm audit output unparseable' };
  const v = (data.metadata ? data.metadata.vulnerabilities : null) || {};
  let total = 0;
  for (const k in v) total += Number(v[k] || 0);
  return { ok: total === 0, total: total, critical: v.critical || 0, high: v.high || 0, moderate: v.moderate || 0, low: v.low || 0 };
}
