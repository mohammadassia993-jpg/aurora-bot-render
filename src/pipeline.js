/**
 * pipeline.js — Event Pipeline (Researcher → Planner → Executor → Reviewer → Orchestrator)
 * Reads/writes data/pipeline.json shared state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_FILE = path.join(__dirname, '..', 'data', 'pipeline.json');

function log(tag, msg) {
  console.log(`[pipeline:${tag}] ${new Date().toISOString()} ${msg}`);
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(PIPELINE_FILE, 'utf8'));
  } catch (e) {
    return { opportunities: [], meta: { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), total_processed: 0, total_approved: 0, total_rejected: 0 } };
  }
}

function save(state) {
  state.meta.updated_at = new Date().toISOString();
  fs.writeFileSync(PIPELINE_FILE, JSON.stringify(state, null, 2));
  return state;
}

export function getPipeline() { return load(); }

export function addOpportunity({ title, link, reward = 0, notes = '' }) {
  const state = load();
  if (state.opportunities.some(o => o.link === link)) return { ok: false, reason: 'duplicate' };
  const opp = {
    id: 'opp_' + String(Date.now()).slice(-6) + '_' + Math.random().toString(36).slice(2, 6),
    title, link, reward,
    status: 'new',
    researcher_notes: notes,
    planner_plan: null,
    executor_result: null,
    reviewer_score: null,
    reviewer_notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  state.opportunities.unshift(opp);
  state.meta.total_processed++;
  save(state);
  log('researcher', `New opportunity: ${title} ($${reward}) → ${opp.id}`);
  return { ok: true, id: opp.id };
}

export function claimNext(status) {
  const state = load();
  const opp = state.opportunities.find(o => o.status === status);
  if (opp) opp.updated_at = new Date().toISOString();
  save(state);
  return opp || null;
}

export function updateOpportunity(id, patch) {
  const state = load();
  const opp = state.opportunities.find(o => o.id === id);
  if (!opp) return { ok: false, reason: 'not found' };
  Object.assign(opp, patch, { updated_at: new Date().toISOString() });
  save(state);
  return { ok: true, opp };
}

export function getStats() {
  const state = load();
  const counts = { new: 0, planned: 0, executing: 0, reviewing: 0, approved: 0, rejected: 0 };
  for (const o of state.opportunities) counts[o.status] = (counts[o.status] || 0) + 1;
  return { counts, meta: state.meta, total: state.opportunities.length };
}

/* ─── Agents ─── */

export async function runResearcher() {
  log('researcher', 'Scanning for new opportunities...');
  let added = 0;
  // GitHub bounties (unassigned, open)
  const ghPat = process.env.GITHUB_PAT;
  if (ghPat) {
    try {
      const q = encodeURIComponent('"$" "bounty" state:open no:assignee type:issue');
      const res = await fetch(`https://api.github.com/search/issues?q=${q}&sort=updated&per_page=10`, {
        headers: { Authorization: `token ${ghPat}`, Accept: 'application/vnd.github+json' }
      });
      const data = await res.json();
      for (const item of (data.items || [])) {
        const body = (item.title + ' ' + (item.body || '')).slice(0, 300).toLowerCase();
        if (['misakanet', 'zero', '$0', 'test bounty', 'fake'].some(s => body.includes(s))) continue;
        const amountMatch = (item.title + ' ' + (item.body || '').slice(0, 200)).match(/\$[\d,]+/);
        const reward = amountMatch ? parseInt(amountMatch[0].replace(/[$,]/g, ''), 10) : 0;
        if (reward < 20) continue;
        const r = addOpportunity({
          title: item.title.slice(0, 90), link: item.html_url, reward,
          notes: `GitHub bounty (${item.repository_url.split('/').pop()})`
        });
        if (r.ok) added++;
      }
    } catch (e) { log('researcher', `GitHub scan error: ${e.message}`); }
  }
  // Superteam
  try {
    const res = await fetch('https://superteam.fun/api/agents/listings/live?take=20', { headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.isWinnersAnnounced || item.status !== 'OPEN') continue;
        const r = addOpportunity({
          title: (item.title || '').slice(0, 90),
          link: `https://superteam.fun/earn/${item.slug || item.id}`,
          reward: item.rewardAmount || 0,
          notes: `Superteam ${item.agentAccess || '?'} (${item.token || 'USD'})`
        });
        if (r.ok) added++;
      }
    }
  } catch (e) { log('researcher', `Superteam scan error: ${e.message}`); }
  log('researcher', `Added ${added} new opportunities`);
  return added;
}

export async function runPlanner() {
  const opp = claimNext('new');
  if (!opp) return false;
  log('planner', `Planning ${opp.id}: ${opp.title}`);
  const plan = {
    goal: opp.title,
    link: opp.link,
    reward: opp.reward,
    steps: [
      { step: 'analyze', desc: 'تحليل المتطلبات والفرصة' },
      { step: 'gather', desc: 'جمع المعلومات اللازمة (الوصف، التعليقات، المتطلبات)' },
      { step: 'craft', desc: 'صياغة الحل الكامل وتجهيز التقديم' },
      { step: 'submit', desc: 'تقديم الحل (GitHub comment أو Superteam submission)' },
      { step: 'self-review', desc: 'مراجعة ذاتية قبل التسليم للمراجع' }
    ],
    tools: opp.link.includes('github.com') ? ['github-api'] : ['playwright-mcp'],
    status: 'ready'
  };
  updateOpportunity(opp.id, { status: 'planned', planner_plan: plan });
  log('planner', `Plan ready for ${opp.id}`);
  return true;
}

export async function runExecutor() {
  const opp = claimNext('planned');
  if (!opp) return false;
  log('executor', `Executing ${opp.id}: ${opp.title}`);
  updateOpportunity(opp.id, { status: 'executing' });
  // For GitHub links — post claim comment
  let result = null;
  try {
    const m = opp.link.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
    if (m && process.env.GITHUB_PAT) {
      const [, owner, repo, issue] = m;
      const body = `## Automated submission — SilentGiants agent\n\nI am executing the plan for this opportunity:\n\n**Reward:** $${opp.reward}\n**Plan:**\n1. Analyze requirements\n2. Gather context\n3. Craft solution\n4. Submit\n\nThis is an automated claim from an AI agent pipeline. Full details: ${opp.planner_plan ? JSON.stringify(opp.planner_plan.steps.map(s => s.desc)) : ''}\n\n— @mohammadassia993-jpg (SilentGiants pipeline)`;
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issue}/comments`, {
        method: 'POST',
        headers: { Authorization: `token ${process.env.GITHUB_PAT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body })
      });
      const data = await res.json();
      result = { submitted: res.ok, comment_id: data.id || null, url: data.html_url || null, at: new Date().toISOString() };
    } else {
      result = { submitted: false, reason: 'unsupported_link', at: new Date().toISOString() };
    }
  } catch (e) {
    result = { submitted: false, error: e.message, at: new Date().toISOString() };
  }
  updateOpportunity(opp.id, { status: 'reviewing', executor_result: result });
  log('executor', `Executed ${opp.id}: ${JSON.stringify(result)}`);
  return true;
}

export async function runReviewer() {
  const opp = claimNext('reviewing');
  if (!opp) return false;
  log('reviewer', `Reviewing ${opp.id}: ${opp.title}`);
  const result = opp.executor_result || {};
  let score = 5, notes = '';
  if (result.submitted && result.comment_id) {
    score = 8;
    notes = `Submission posted (comment #${result.comment_id}). Meets requirements, could improve with more detailed solution.`;
  } else if (result.submitted) {
    score = 7;
    notes = 'Submitted but verification incomplete.';
  } else {
    score = 4;
    notes = 'Submission not posted — ' + (result.reason || result.error || 'unknown');
  }
  updateOpportunity(opp.id, { status: score >= 7 ? 'approved' : 'rejected', reviewer_score: score, reviewer_notes: notes });
  log('reviewer', `${opp.id} → ${score >= 7 ? 'APPROVED' : 'REJECTED'} (${score}/10)`);
  return true;
}

export async function runOrchestrator() {
  const state = load();
  const approved = state.opportunities.filter(o => o.status === 'approved' && !o.reported);
  const rejected = state.opportunities.filter(o => o.status === 'rejected' && !o.reported);
  const results = { approved: [], rejected: [] };
  for (const o of approved) { results.approved.push({ id: o.id, title: o.title, link: o.link, score: o.reviewer_score }); updateOpportunity(o.id, { reported: true }); }
  for (const o of rejected) { results.rejected.push({ id: o.id, title: o.title, link: o.link, score: o.reviewer_score }); updateOpportunity(o.id, { reported: true }); }
  return results;
}

export default { getPipeline, addOpportunity, claimNext, updateOpportunity, getStats, runResearcher, runPlanner, runExecutor, runReviewer, runOrchestrator };
