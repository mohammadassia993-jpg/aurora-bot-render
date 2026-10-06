import { execFile } from 'node:child_process';
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'mohammadassia993-jpg/aurora-bot-render';
const TARGETS = [
  'src/automation/actual-apply.mjs',
  'src/automation/apply-jobs.mjs',
  'src/automation/check-platforms.mjs'
];
const h = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json' };

console.log('START — Token:', TOKEN ? 'YES' : 'NO');

for (const p of TARGETS) {
  try {
    const g = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + p, { headers: h });
    if (!g.ok) { console.log('❌ GET', p, g.status); continue; }
    const d = await g.json();
    const r = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + p, {
      method: 'DELETE',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'cleanup: remove ' + p.split('/').pop(), sha: d.sha, branch: 'main' })
    });
    console.log(r.ok ? '✅' : '❌', p, r.status);
  } catch (e) { console.log('❌ ERR', p, e.message); }
}
console.log('DONE');
