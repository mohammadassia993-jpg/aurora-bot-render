/**
 * automator.js — Fully automated background jobs (no human input required)
 * 
 * 1. Self-keepalive: pings backup service every 10 min to keep it awake
 * 2. Superteam monitor: checks for new listings every 30 min, alerts via Telegram
 */

import fs from 'node:fs';
import { config } from './config.js';
import { info, warn } from './logger.js';

const SUPERTEAM_KEY = process.env.SUPERTEAM_AGENT_API_KEY || '';
const SUPERTEAM_API = 'https://superteam.fun/api/agents/listings/live?take=50';
const STATE_FILE = '/tmp/superteam-listings.json';
const KEEPALIVE_INTERVAL = 10 * 60 * 1000;
const MONITOR_INTERVAL = 30 * 60 * 1000;

async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Self-keepalive: ping backup service to prevent Render sleep */
async function keepAlive() {
  if (!config.backupUrl) return;
  try {
    await fetchJson(`${config.backupUrl.replace(/\/$/, '')}/keepalive`, {}, 8000);
    info('automator', 'backup keepalive ping successful');
  } catch (caught) {
    warn('automator', `backup keepalive failed: ${caught.message}`);
  }
}

/** Monitor Superteam for new agent-eligible listings */
async function monitorSuperteam() {
  if (!SUPERTEAM_KEY) {
    info('automator', 'superteam monitor skipped: no API key');
    return;
  }
  try {
    const listings = await fetchJson(SUPERTEAM_API, {
      headers: { Authorization: `Bearer ${SUPERTEAM_KEY}` }
    }, 15000);

    if (!Array.isArray(listings)) return;

    const agentEligible = listings.filter(l =>
      (l.agentAccess === 'AGENT_ALLOWED' || l.agentAccess === 'AGENT_ONLY') && !l.isWinnersAnnounced
    );

    const previousCount = loadPreviousCount();
    const currentCount = agentEligible.length;

    if (currentCount > 0 && currentCount !== previousCount) {
      const summary = agentEligible.map(l =>
        `• ${l.title} — ${l.rewardAmount} ${l.token} [${l.agentAccess}]`
      ).join('\n');
      const text = [
        `🎯 فرصة جديدة على Superteam! (${currentCount} فرصة مفتوحة)`,
        summary,
        `للتقديم: node scripts/submit-api.js --submit-all`,
        `الوقت: ${new Date().toISOString()}`
      ].join('\n\n');

      try {
        const { sendMessageDetailed } = await import('./telegram.js');
        await sendMessageDetailed(text);
        info('automator', `sent ${currentCount} new listing(s) to leader`);
      } catch (sentErr) {
        warn('automator', `could not send listing alert: ${sentErr.message}`);
      }
    }

    savePreviousCount(currentCount);
    info('automator', `superteam monitor: ${currentCount} agent-eligible open listings`);
  } catch (caught) {
    warn('automator', `superteam monitor failed: ${caught.message}`);
  }
}

function loadPreviousCount() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return data.count || 0;
  } catch {
    return 0;
  }
}

function savePreviousCount(count) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ count, checkedAt: new Date().toISOString() }));
  } catch {}
}

/** Start all automator jobs */
export function startAutomator() {
  info('automator', 'starting automator jobs');

  // Keepalive every 10 minutes
  setInterval(keepAlive, KEEPALIVE_INTERVAL).unref();
  keepAlive().catch(() => {});

  // Superteam monitor every 30 minutes
  setInterval(monitorSuperteam, MONITOR_INTERVAL).unref();
  monitorSuperteam().catch(() => {});
}
