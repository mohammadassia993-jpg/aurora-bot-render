#!/usr/bin/env node
/**
 * monitor-jobs.js — Automated job discovery across Freelancer, Remotive, RemoteOK
 * No CAPTCHA, no auth required for reading. Fully automated.
 * 
 * Usage: node scripts/monitor-jobs.js          # list jobs
 *        node scripts/monitor-jobs.js --alert   # send new jobs via Telegram
 */

import fs from 'node:fs';
const STATE_FILE = '/tmp/job-monitor-state.json';
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID || '';
const KEYWORDS = { 'web3': /web3/, 'blockchain': /blockchain/, 'content': /content\s*(writer|writing|creation)/, 'arabic': /arabic/, 'defi': /defi/, 'solana': /solana/, 'smart contract': /smart\s*contract/, 'community': /community\s*manager/, 'translation': /translat/, 'technical writing': /technical\s*writing/, 'crypto': /crypto|writer|cryptocurrency/ };

function log(msg) { console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`); }

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function searchFreelancer() {
  try {
    const data = await fetchJson('https://www.freelancer.com/api/projects/0.1/projects/active/?limit=30&full_description=false');
    const projects = data?.result?.projects || [];
    return projects.filter(p => {
      const text = `${p.title} ${(p.jobs||[]).map(j=>j.name||'').join(' ')}`.toLowerCase();
      return Object.values(KEYWORDS).some(rx => rx.test(text));
    }).map(p => ({
      source: 'freelancer.com',
      title: p.title,
      budget: `${p.budget?.minimum || '?'}-${p.budget?.maximum || '?'} ${(p.budget?.currency?.code||'')}`,
      url: `https://www.freelancer.com/projects/${p.seo_url || p.id}`
    }));
  } catch (e) { log(`Freelancer error: ${e.message}`); return []; }
}

async function searchRemotive() {
  try {
    const data = await fetchJson('https://remotive.com/api/remote-jobs?limit=50');
    const jobs = data?.jobs || [];
    return jobs.filter(j => {
      const text = `${j.title} ${j.description || ''}`.toLowerCase();
      return Object.values(KEYWORDS).some(rx => rx.test(text));
    }).map(j => ({
      source: 'remotive.com',
      title: j.title,
      budget: j.salary ? `${j.salary}` : 'N/A',
      url: j.url || j.url_preview || 'https://remotive.com'
    }));
  } catch (e) { log(`Remotive error: ${e.message}`); return []; }
}

async function searchRemoteOK() {
  try {
    const data = await fetchJson('https://remoteok.com/api');
    return data.filter(j => typeof j === 'object' && j.position && Object.values(KEYWORDS).some(rx =>
      `${j.position} ${j.description || ''}`.toLowerCase().match(rx)
    )).map(j => ({
      source: 'remoteok.com',
      title: j.position,
      budget: j.salary_min ? `$${j.salary_min}-${j.salary_max || '?'}` : 'N/A',
      url: j.url || 'https://remoteok.com'
    }));
  } catch (e) { log(`RemoteOK error: ${e.message}`); return []; }
}

async function sendAlert(jobs) {
  if (!TG_TOKEN || !TG_CHAT || jobs.length === 0) return;
  const text = [
    `🎯 ${jobs.length} فرصة جديدة للعمل الحر!`,
    '',
    ...jobs.slice(0, 10).map(j => `• [${j.source}] ${j.title}\n  💰 ${j.budget}\n  🔗 ${j.url}`),
    '',
    `🔄 آخر فحص: ${new Date().toISOString()}`
  ].join('\n\n');

  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text })
    });
    log(`Sent ${jobs.length} jobs to Telegram`);
  } catch (e) { log(`Telegram send failed: ${e.message}`); }
}

function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { seen: [] }; } }
function saveState(state) { try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch {} }

async function main() {
  const alertMode = process.argv.includes('--alert');
  log('🔍 Searching Freelancer, Remotive, RemoteOK...');
  
  const [freelancer, remotive, remoteok] = await Promise.all([
    searchFreelancer(), searchRemotive(), searchRemoteOK()
  ]);
  
  const all = [...freelancer, ...remotive, ...remoteok];
  const state = loadState();
  const seenUrls = new Set(state.seen || []);
  const newJobs = all.filter(j => !seenUrls.has(j.url));
  
  log(`📊 Results: ${all.length} total, ${newJobs.length} new`);
  log(`  Freelancer: ${freelancer.length} | Remotive: ${remotive.length} | RemoteOK: ${remoteok.length}`);
  
  if (newJobs.length > 0) {
    log('\n🆕 New jobs:');
    newJobs.forEach(j => log(`  [${j.source}] ${j.title} — ${j.budget}`));
  }
  
  if (alertMode && newJobs.length > 0) {
    await sendAlert(newJobs);
  }
  
  // Save all URLs as seen
  state.seen = [...seenUrls, ...all.map(j => j.url)].slice(-500);
  state.lastCheck = new Date().toISOString();
  state.totalFound = all.length;
  saveState(state);
  
  return all;
}

main().catch(e => { console.error(e); process.exit(1); });
