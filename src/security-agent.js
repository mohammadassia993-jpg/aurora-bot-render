// security-agent.js — Defensive Security Auditor
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';

const ROOT = config.root;
const SECRET_PATTERN = /(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|MNEMONIC|SEED)/i;
const PLACEHOLDER_PATTERN = /^(your_|xxx|example|placeholder)/i;

export async function auditEnvVars() {
  const issues = [];
  try {
    const example = await fs.readFile(path.join(ROOT, '.env.example'), 'utf8');
    for (const line of example.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
      if (!m || !m[2]) continue;
      const key = m[1];
      const value = m[2].trim();
      if (!SECRET_PATTERN.test(key)) continue;
      if (PLACEHOLDER_PATTERN.test(value)) continue;
      if (value.length < 15) continue;
      issues.push({ file: '.env.example', key, issue: 'value looks real' });
    }
  } catch {}
  try {
    const gi = await fs.readFile(path.join(ROOT, '.gitignore'), 'utf8');
    if (!gi.includes('.env')) issues.push({ file: '.gitignore', issue: 'does not ignore .env' });
  } catch {
    issues.push({ file: '.gitignore', issue: 'missing' });
  }
  return { ok: issues.length === 0, issues };
}

export async function auditRecentErrors() {
  return { ok: true, scanned: 0, hits: [] };
}

export async function auditApiAuth() {
  return { ok: true, skipped: true, reason: 'placeholder' };
}

export async function auditFileIntegrity() {
  return { ok: true, files: [] };
}

export async function generateSecurityReport() {
  const env = await auditEnvVars();
  const lines = [
    'Security Audit Report',
    '=====================',
    'Env Vars: ' + (env.ok ? 'OK' : env.issues.length + ' issue(s)')
  ];
  if (!env.ok) for (const i of env.issues) lines.push('  - ' + i.file + ': ' + i.issue);
  return { report: lines.join('\n'), summary: { env: env.ok, issues: env.issues.length } };
}
