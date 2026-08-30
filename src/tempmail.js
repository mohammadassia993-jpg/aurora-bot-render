/**
 * mail.tm REST API integration — free email without 2SV or CAPTCHA.
 * Enables receiving verification emails and API keys from platforms.
 */
import { config } from './config.js';
import { info, warn } from './logger.js';
import fs from 'node:fs';
import path from 'node:path';

const API = config.tmEmailApi || 'https://api.mail.tm';
const credsPath = path.join(config.root, 'data', 'tempmail.json');

function loadCreds() {
  try { return JSON.parse(fs.readFileSync(credsPath, 'utf8')); } catch { return null; }
}

function saveCreds(creds) {
  fs.mkdirSync(path.dirname(credsPath), { recursive: true });
  fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2));
}

async function apiCall(url, opts = {}) {
  const resp = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    signal: AbortSignal.timeout(15000)
  });
  if (!resp.ok) throw new Error(`MAIL.TM ${resp.status}: ${await resp.text().catch(() => 'unknown')}`);
  return resp.json();
}

export async function createTempEmail(prefix = 'silentgiants') {
  const domains = await apiCall(`${API}/domains`);
  const domain = domains['hydra:member']?.[0]?.domain;
  if (!domain) throw new Error('No mail.tm domains available');

  const rand = Math.random().toString(36).slice(2, 12);
  const address = `${prefix}${rand}@${domain}`;
  const password = 'SgBot2026!x';

  const account = await apiCall(`${API}/accounts`, {
    method: 'POST',
    body: JSON.stringify({ address, password })
  });

  const tokenResp = await apiCall(`${API}/token`, {
    method: 'POST',
    body: JSON.stringify({ address, password })
  });

  const creds = { address, password, domain, token: tokenResp.token, createdAt: new Date().toISOString() };
  saveCreds(creds);
  info('tempmail', 'created email', { address });
  return creds;
}

export async function getMessages(token) {
  const t = token || loadCreds()?.token;
  if (!t) throw new Error('No temp mail token');
  const data = await apiCall(`${API}/messages`, {
    headers: { Authorization: `Bearer ${t}` }
  });
  return data['hydra:member'] || [];
}

export async function getMessage(messageId, token) {
  const t = token || loadCreds()?.token;
  if (!t) throw new Error('No temp mail token');
  return apiCall(`${API}/messages/${messageId}`, {
    headers: { Authorization: `Bearer ${t}` }
  });
}

export async function waitForVerificationEmail(platform, timeoutMs = 120000) {
  const creds = loadCreds();
  if (!creds) throw new Error('No temp mail account — create one first');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const messages = await getMessages(creds.token);
    const match = messages.find(m =>
      m.subject?.toLowerCase().includes('verify') ||
      m.subject?.toLowerCase().includes('confirm') ||
      m.subject?.toLowerCase().includes('verif') ||
      m.from?.address?.includes(platform.toLowerCase())
    );
    if (match) {
      const full = await getMessage(match.id, creds.token);
      const links = (full.text || '').match(/https?:\/\/[^\s<>"]+/g) || [];
      info('tempmail', 'verification email received', { from: match.from?.address, links: links.length });
      return { message: full, links, subject: match.subject };
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  return null;
}
