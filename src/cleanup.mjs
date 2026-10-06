const TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'mohammadassia993-jpg/aurora-bot-render';
const TARGETS = [
  'src/automation/coalition-apply.mjs',
  'src/automation/direct-apply.mjs',
  'src/automation/email-apply.mjs',
  'src/automation/email-apply2.mjs',
  'src/automation/extract-all-keys.mjs',
  'src/automation/extract-keys.mjs',
  'src/automation/extract-keys2.mjs',
  'src/automation/get-keys.mjs',
  'src/automation/gitcoin-apply.mjs',
  'src/automation/gitcoin-apply2.mjs',
  'src/automation/gitcoin-bounties.mjs',
  'src/automation/gitcoin-grants.mjs',
  'src/automation/gumroad-create-app.mjs',
  'src/automation/gumroad-create-app2.mjs',
  'src/automation/gumroad-create-app3.mjs',
  'src/automation/gumroad-extract.mjs',
  'src/automation/gumroad-extract2.mjs',
  'src/automation/gumroad-final.mjs',
  'src/automation/gumroad-keys.mjs',
  'src/automation/gumroad-publish.mjs',
  'src/automation/gumroad-publish2.mjs',
  'src/automation/gumroad-upload.mjs',
  'src/automation/immunefi-browse.mjs',
  'src/automation/immunefi-programs.mjs',
  'src/automation/job-search.mjs',
  'src/automation/oauth.js',
  'src/automation/payhip.js',
  'src/automation/search-superteam.mjs',
  'src/automation/signup-extract.mjs',
  'src/automation/signup-v3.mjs',
  'src/automation/signup-v4.mjs',
  'src/automation/signup-v5.mjs',
  'src/automation/submit-apps.mjs',
  'src/automation/superteam-search.mjs',
  'src/automation/test-hunter.js',
  'src/automation/tor-superteam.mjs',
  'src/automation/upload-gumroad.mjs',
  'src/automation/upload-gumroad2.mjs',
  'src/automation/upload-gumroad3.mjs',
  'src/automation/verify-and-apply.mjs'
];
const h = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json' };

console.log('START — Total:', TARGETS.length);
let ok = 0, fail = 0;

for (const p of TARGETS) {
  try {
    const g = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + p, { headers: h });
    if (!g.ok) { console.log('❌ GET', p, g.status); fail++; continue; }
    const d = await g.json();
    const r = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + p, {
      method: 'DELETE',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'cleanup: remove ' + p.split('/').pop(), sha: d.sha, branch: 'main' })
    });
    if (r.ok) { console.log('✅', p.split('/').pop()); ok++; }
    else { console.log('❌', p.split('/').pop(), r.status); fail++; }
  } catch (e) { console.log('❌ ERR', p, e.message); fail++; }
}
console.log('=== DONE ===');
console.log('Deleted:', ok, '| Failed:', fail);
