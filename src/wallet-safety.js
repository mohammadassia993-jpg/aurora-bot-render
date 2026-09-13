/**
 * wallet-safety.js — نظام اختبار المحفظة قبل أي توقيع أو التزام (الأمر 2026-09-13)
 *
 * القاعدة: لا محفظة بدون اختبار.
 * النظام يعمل بسياسة RECEIVE_ONLY: لا يوجد أي مفتاح خاص أو مادة توقيع في البيئة.
 * - فحص العناوين (EVM / Solana base58).
 * - تدقيق أمني: أي مفتاح خاص/عبارة سرية في المنظومة = إنذار فوري.
 * - فحص ما قبل التوقيع: simulation بدون RPC (لا توجد أوراق اعتماد RPC في البيئة).
 */
import { config } from './config.js';
import { recordError } from './db.js';

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function validateWalletAddress(address, network = 'auto') {
  const addr = String(address || '').trim();
  if (!addr) return { valid: false, reason: 'empty' };
  const net = network !== 'auto' ? network : (addr.startsWith('0x') ? 'evm' : 'sol');
  if (net === 'sol') return { valid: SOL_RE.test(addr), network: net, address: addr };
  return { valid: EVM_RE.test(addr), network: net, address: addr };
}

export function walletSafetyAudit() {
  const riskyKeys = Object.keys(process.env).filter(k => /PRIVATE_KEY|MNEMONIC|SEED_PHRASE|SECRET.*KEY/i.test(k));
  const addresses = [config.usdcBaseAddress, config.usdcSolanaAddress, config.trc20Address].filter(Boolean);
  const checked = addresses.map(address => validateWalletAddress(address, address.startsWith('0x') ? 'evm' : 'sol'));

  const verdict = {
    policy: 'RECEIVE_ONLY',
    receiveOnly: riskyKeys.length === 0,
    keyMaterialKeys: riskyKeys,
    addresses: checked,
    passed: riskyKeys.length === 0 && checked.every(c => c.valid)
  };

  if (!verdict.passed) {
    recordError('wallet', 'WALLET_SAFETY_ALERT', JSON.stringify({
      riskyKeys,
      invalidAddresses: checked.filter(c => !c.valid).map(c => c.address)
    }), {}, 'مراجعة فورية قبل أي توقيع');
  }
  return verdict;
}

export function preSignCheck({ address, network = 'auto', amount = 0 }) {
  const audit = walletSafetyAudit();
  const addr = validateWalletAddress(address, network);
  const checks = {
    addressValid: addr.valid,
    receiveOnlyPolicy: audit.receiveOnly,
    noSigningMaterial: audit.receiveOnly,
    amountNonNegative: Number(amount) >= 0
  };
  const passed = Object.values(checks).every(Boolean);
  const result = {
    passed,
    checks,
    mode: 'simulation_no_rpc',
    note: passed
      ? 'آمن: نظام استقبال فقط ولا يوجد مادة توقيع'
      : 'محجوب قبل التوقيع — راجع تقرير أمان المحفظة'
  };
  if (!passed) recordError('wallet', 'SIGN_BLOCKED', JSON.stringify(result), {}, 'Blocked by wallet safety gate');
  return result;
}

export function buildWalletReport() {
  const audit = walletSafetyAudit();
  return [
    '💼 تقرير أمان المحفظة (اختبار ما قبل الالتزام)',
    '━━━━━━━━━━━━━━━',
    `السياسة: ${audit.policy}`,
    `مفاتيح خاصة في البيئة: ${audit.keyMaterialKeys.length ? audit.keyMaterialKeys.join(', ') : '0 (لا يوجد)'}`,
    `عناوين مُتحقَّقة: ${audit.addresses.map(a => `${a.address.slice(0, 12)}…${a.address.slice(-6)} (${a.network}: ${a.valid ? '✅' : '❌'})`).join('، ') || 'لا عناوين مضافة بعد'}`,
    '',
    `النتيجة: ${audit.passed ? '✅ آمنة — لا توقيع خارج نطاق الاستقبال' : '🚨 إنذار — راجع السجل فوراً'}`
  ].join('\n');
}
