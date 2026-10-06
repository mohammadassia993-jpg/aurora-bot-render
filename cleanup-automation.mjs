const TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'mohammadassia993-jpg/aurora-bot-render';
const KEEP = ['followup-scheduler.js'];
const headers = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json' };

async function list() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/src/automation`, { headers });
  if (!r.ok) throw new Error('list ' + r.status);
  return await r.json();
}

async function del(path) {
  const g = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, { headers });
  if (!g.ok) return false;
  const d = await g.json();
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: 'DELETE',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'cleanup: remove unused automation file', sha: d.sha, branch: 'main' })
  });
  return r.ok;
}

const files = await list();
const targets = files.filter(f => f.type === 'file' && !KEEP.includes(f.name));
console.log('Total:', files.length, '| To delete:', targets.length);

let ok = 0, fail = 0;
const BATCH = 5;
for (let i = 0; i < targets.length; i += BATCH) {
  await Promise.all(targets.slice(i, i + BATCH).map(async f => {
    if (await del(f.path)) { ok++; console.log('✅', f.name); }
    else { fail++; console.log('❌', f.name); }
  }));
}
console.log('=== SUMMARY ===');
console.log('Deleted:', ok, '| Failed:', fail);
