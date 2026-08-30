// Build ready-to-deliver product packs from existing deliverables, in store-delivery/
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'store-delivery');
fs.mkdirSync(out, { recursive: true });

function collect(patterns) {
  const found = [];
  for (const pattern of patterns) {
    const file = path.join(root, 'deliverables', pattern);
    if (fs.existsSync(file)) found.push(file);
  }
  return found;
}

const packs = [
  {
    id: '1', name: 'قاموس مصطلحات Web3 (عربي/إنجليزي)',
    files: collect(['translations/en-ar-web3-glossary-2.md', 'translations/en-ar-web3-glossary.md', 'translations/en-ar-depin-basics.md'])
  },
  {
    id: '2', name: 'دورة أساسيات DePIN (5 محطات)',
    files: collect(['education/learn-depin-basics-ar.md', 'articles/ar-depin-vs-centralized.md', 'articles/ar-depin-sensors-oracles.md', 'articles/ar-depin-latency-reliability.md', 'articles/ar-web3-depin-intro.md'])
  },
  {
    id: '3', name: 'حزمة كتابة محتوى Web3 (10 قوالب)',
    files: collect(['pipeline/sample-ar-article-tokenomics.md', 'pipeline/ar-crypto-content-pipeline-plan.md', 'articles/ar-security-staking-risks.md', 'articles/ar-crypto-safety.md', 'articles/ar-web3-wallets-easy-guide.md'])
  },
  {
    id: '4', name: 'شرح العقد الذكي للمبتدئين',
    files: collect(['education/learn-web3-terms-ar.md', 'security/sample-audit-summary-web3.md', 'analysis/analysis-tokenomics-checklist.md'])
  },
  {
    id: '5', name: 'حزمة تقديم الوظائف Web3',
    files: collect(['job-packages/web3-content-writer-cover-ar.md', 'job-packages/depin-community-manager-ar.md', 'job-packages/web3-translator-cover-ar.md', 'job-packages/application-submission-kit.md'])
  },
  {
    id: '6', name: 'تحليل الأمن والاقتصاد الرمزي',
    files: collect(['analysis/analysis-tokenomics-checklist.md', 'security/sample-audit-summary-web3.md', 'analysis/opportunity-analysis-2026-08-27.md'])
  }
];

for (const pack of packs) {
  const bundle = [
    `# ${pack.name}`,
    '',
    '🛡️ **فريق عمالقة الصمت (Silent Giants)**',
    '**الدفع:** USDT (TON) / USDC (Base)',
    '**التسليم:** ملفات رقمية — تحميل فوري',
    '',
    '---',
    ''
  ].join('\n');
  const parts = [bundle];
  for (const file of pack.files) {
    const rel = path.relative(path.join(root, 'deliverables'), file);
    parts.push(`## 📄 ${rel}\n`);
    try { parts.push(fs.readFileSync(file, 'utf8').trim()); } catch {}
    parts.push('\n---\n');
  }
  const safeName = pack.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  const dest = path.join(out, `product-${pack.id}-${safeName}.md`);
  fs.writeFileSync(dest, parts.join('\n').replace(/\n{3,}/g, '\n\n'));
  console.log(`📦 ${pack.id} → ${path.relative(root, dest)} (${pack.files.length} files, ${fs.statSync(dest).size} bytes)`);
}
console.log('\nDone: store-delivery packs ready for instant handoff.');
