import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from './config.js';

const statePath = path.join(config.root, 'data', 'tunnel.json');

export async function readPublicLink() {
  try {
    return JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch {
    return { url: '', token: config.teamUiToken };
  }
}

async function savePublicLink(url) {
  const payload = { url, token: config.teamUiToken, updatedAt: new Date().toISOString() };
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(payload, null, 2));
}

export async function launchQuickTunnel() {
  if (process.env.ENABLE_CLOUDFLARE_TUNNEL !== 'true') return;
  const binary = process.env.CLOUDFLARED_PATH || '/usr/local/bin/cloudflared';
  try {
    await fs.access(binary);
  } catch {
    return;
  }
  const child = spawn(binary, ['tunnel', '--url', `http://127.0.0.1:${config.port}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => output += chunk);
  child.stderr.on('data', chunk => output += chunk);
  const interval = setInterval(async () => {
    const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match) {
      await savePublicLink(match[0]);
      clearInterval(interval);
    }
  }, 2000);
  child.on('exit', () => clearInterval(interval));
}

export function startTunnelWatcher() {
  launchQuickTunnel().catch(() => {});
  setInterval(() => {
    if (!config.publicBaseUrl) launchQuickTunnel().catch(() => {});
  }, 5 * 60_000).unref();
}

export async function writePublicLink(url) {
  await savePublicLink(url);
}
