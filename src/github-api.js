/**
 * github-api.js — GitHub API via PAT (no GitHub App needed)
 * 
 * Uses the current PAT (repo scope) for all GitHub operations.
 * PAT can: create issues, create PRs, push commits, manage project.
 */
import https from 'node:https';

const PAT = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || '';
const REPO = process.env.GITHUB_REPO || 'mohammadassia993-jpg/aurora-bot-render';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${REPO}${path}`,
      method,
      headers: {
        'Authorization': `token ${PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'aurora-bot',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch { resolve(b); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

export async function createIssue(title, body, labels = []) {
  const result = await request('POST', '/issues', { title, body, labels });
  console.log(`[GitHub] Issue created: ${result.number || result.message}`);
  return result;
}

export async function createPR(title, head, base = 'main', body = '') {
  const result = await request('POST', '/pulls', { title, head, base, body });
  console.log(`[GitHub] PR created: ${result.number || result.message}`);
  return result;
}

export async function mergePR(prNumber) {
  const result = await request('PUT', `/pulls/${prNumber}/merge`, { merge_method: 'squash' });
  console.log(`[GitHub] PR #${prNumber} merged: ${result.merged || result.message}`);
  return result;
}

export async function commentIssue(issueNumber, body) {
  const result = await request('POST', `/issues/${issueNumber}/comments`, { body });
  console.log(`[GitHub] Comment on #${issueNumber}: ${result.id || result.message}`);
  return result;
}

export async function listIssues(state = 'open') {
  return request('GET', `/issues?state=${state}&per_page=20`);
}

export async function getRepoHealth() {
  const issues = await listIssues('open');
  const prs = await request('GET', '/pulls?state=open');
  return {
    openIssues: Array.isArray(issues) ? issues.length : 0,
    openPRs: Array.isArray(prs) ? prs.length : 0,
    issues: Array.isArray(issues) ? issues.map(i => ({ number: i.number, title: i.title })) : [],
    prs: Array.isArray(prs) ? prs.map(p => ({ number: p.number, title: p.title })) : []
  };
}

export default { createIssue, createPR, mergePR, commentIssue, listIssues, getRepoHealth };
