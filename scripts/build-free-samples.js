// Build short free-sample teasers to attract buyers, from existing deliverables
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'store-delivery', 'free-samples');
fs.mkdirSync(out, { recursive: true });
function headOf(rel, n=12) {
  const p = path.join(root,'deliverables',rel);
  if (!fs.existsSync(p)) return '';
  const lines = fs.readFileSync(p,'utf8').split('\n');
  return lines.slice(0,n).join('\n');
}
const samples = [
  ['sample-glossary.md', '📖 عيّنة من قاموس Web3 (250+ مصطلح)', 'translations/en-ar-web3-glossary-2.md', 'النسخة الكاملة + كل المصطلحات في المنتج 🛒'],
  ['sample-depin.md', '🎓 عيّنة من دورة أساسيات DePIN', 'articles/ar-depin-vs-centralized.md', 'الدورة الكاملة بـ 5 محطات في المنتج 🛒'],
  ['sample-security.md', '🔐 عيّنة من مراجعة الأمان', 'security/sample-audit-summary-web3.md', 'قائمة التدقيق الكاملة في المنتج 🛒'],
  ['sample-staking.md', '💠 عيّنة: مخاطر Staking وكيف تحمي أصولك', 'articles/ar-security-staking-risks.md', 'الدليل الكامل في المنتج 🛒']
];
for (const [file, title, src, cta] of samples) {
  const body = headOf(src);
  const content = [`# ${title}`, '', '*عيّنة مجانية — فريق عمالقة الصمت*', '', '---', '', body, '', '---', '', `💠 ${cta}`, '', '`@Aurora_Almada_88_Bot` — اكتب «اشتري <رقم>»'].join('\n');
  fs.writeFileSync(path.join(out,file), content);
  console.log('💠', file, `(${fs.statSync(path.join(out,file)).size} bytes)`);
}
console.log('\nFree samples ready in store-delivery/free-samples/');
