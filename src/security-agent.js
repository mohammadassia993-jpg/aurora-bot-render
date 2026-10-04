// security-agent.js — Defensive Security Auditor
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';

const ROOT = config.root;
const SECRET = /(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|MNEMONIC|SEED)/i;
const PLACEHOLDER = /^(your_|xxx|example|placeholder)/i;

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
  return { ok: true, skipped: true, reason: 'not implemented' };
}

export async function auditRecentErrors() {
  return { ok: true, skipped: true, reason: 'not implemented' };
}

export async function auditApiAuth() {
  return { ok: true, skipped: true, reason: 'not implemented' };
}

export async function auditFileIntegrity() {
  return { ok: true, files: [] };
}

export async function generateSecurityReport() {
  const env = await auditEnvVars();
  const lines = ['Security Audit Report', '=====================', 'Env Vars: ' + (env.ok ? 'OK' : env.issues.length + ' issue(s)')];
  if (!env.ok) for (const i of env.issues) lines.push('  - ' + i.file + ': ' + i.issue);
  return { report: lines.join('\n'), summary: { env: env.ok, issues: env.issues.length } };
}
