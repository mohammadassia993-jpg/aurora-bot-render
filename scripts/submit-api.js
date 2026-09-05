#!/usr/bin/env node
/**
 * submit-api.js — Superteam Earn Agent API submission (no browser required)
 * 
 * Uses the official Superteam Agent API:
 *   GET  /api/agents/listings/live          — discover agent-eligible bounties
 *   POST /api/agents/submissions/create      — submit work
 * 
 * Env vars required:
 *   SUPERTEAM_AGENT_API_KEY  (Bearer token from agent registration)
 * 
 * Usage:
 *   node scripts/submit-api.js                    # list open listings
 *   node scripts/submit-api.js --submit-all       # submit to all eligible open listings
 *   node scripts/submit-api.js --listing <slug>   # submit to one specific listing
 */

import fs from 'node:fs';
import path from 'node:path';

const API_KEY  = process.env.SUPERTEAM_AGENT_API_KEY || process.env.SUPERTEAM_API_KEY || '';
const BASE_URL = 'https://superteam.fun';
const GITHUB   = 'https://github.com/mohammadassia993-jpg/aurora-bot-render';
const TELEGRAM = 'http://t.me/Aurora_Almada_88_Bot';
const ROOT     = path.resolve(import.meta.dirname, '..');
const AUDIT_LOG = path.join(ROOT, 'logs', 'api-submission.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(AUDIT_LOG, line + '\n'); } catch {}
}

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text, _status: res.status }; }
}

async function listOpenBounties() {
  const data = await api('GET', '/api/agents/listings/live?take=100');
  if (!Array.isArray(data)) { console.error('Unexpected response:', data); return []; }
  return data.filter(l => l.agentAccess === 'AGENT_ALLOWED' || l.agentAccess === 'AGENT_ONLY');
}

function eligibilityAnswers(listing) {
  const qs = listing.eligibility || [];
  return qs.map(q => ({ question: q.question || q, answer: q.sampleAnswer || 'Web3 content deliverable' }));
}

async function submitToListing(listing, dryRun = false) {
  const payload = {
    listingId: listing.id,
    link: GITHUB,
    tweet: '',
    otherInfo: `${listing.title} — AI-generated Web3 deliverables including Arabic educational content, DePIN analysis, and community engagement materials. Repository: ${GITHUB}`,
    eligibilityAnswers: eligibilityAnswers(listing),
    ask: null,
    telegram: TELEGRAM
  };

  if (dryRun) {
    log(`[DRY RUN] Would submit to: ${listing.title} (${listing.slug})`);
    return { status: 'dry-run', slug: listing.slug };
  }

  log(`Submitting to: ${listing.title} (${listing.slug})`);
  const result = await api('POST', '/api/agents/submissions/create', payload);
  const success = !result.error;
  log(`  Result: ${success ? 'SUCCESS' : 'FAILED'} — ${JSON.stringify(result).slice(0, 200)}`);
  return { status: success ? 'success' : 'failed', slug: listing.slug, result };
}

async function main() {
  const args = process.argv.slice(2);
  const submitAll = args.includes('--submit-all');
  const listingSlug = args.includes('--listing') ? args[args.indexOf('--listing') + 1] : null;
  const dryRun = args.includes('--dry-run');

  if (!API_KEY) {
    console.error('No API key. Set SUPERTEAM_AGENT_API_KEY or SUPERTEAM_API_KEY');
    process.exit(1);
  }

  log(`=== Superteam API Submission (dryRun=${dryRun}) ===`);
  const bounties = await listOpenBounties();
  const openBounties = bounties.filter(b => !b.isWinnersAnnounced);
  const closedBounties = bounties.filter(b => b.isWinnersAnnounced);

  log(`Total agent-eligible: ${bounties.length} (${openBounties.length} open, ${closedBounties.length} closed)`);

  if (!submitAll && !listingSlug) {
    // List mode
    console.log('\n📋 Agent-eligible listings:');
    for (const b of bounties) {
      const marker = b.isWinnersAnnounced ? '❌ closed' : '✅ OPEN';
      console.log(`  ${marker} ${b.title} — ${b.rewardAmount} ${b.token} [${b.agentAccess}]`);
      console.log(`    slug: ${b.slug}`);
    }
    console.log(`\nTo submit: node scripts/submit-api.js --submit-all [--dry-run]`);
    return;
  }

  if (openBounties.length === 0) {
    log('⚠️ No open bounties available for submission.');
    console.log('⚠️ All agent-eligible bounties have closed (winners announced).');
    console.log('   Run without --submit-all to see the full list.');
    console.log('   New bounties appear periodically — this script is ready to submit when they do.');
    return;
  }

  const results = [];
  for (const b of (listingSlug ? openBounties.filter(b => b.slug === listingSlug) : openBounties)) {
    const r = await submitToListing(b, dryRun);
    results.push(r);
    await new Promise(r => setTimeout(r, 2000)); // rate limit
  }

  const successes = results.filter(r => r.status === 'success').length;
  const failures = results.filter(r => r.status === 'failed').length;
  log(`\n=== Results: ${successes} success, ${failures} failed, ${results.length} total ===`);
  console.log(`\n📊 Results: ${successes}/${results.length} submitted successfully`);
}

main().catch(e => { console.error(e); process.exit(1); });
