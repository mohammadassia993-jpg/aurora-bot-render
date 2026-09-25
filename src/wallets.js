// wallets.js — جلب أرصدة المحافظ من blockchain مباشرة
// لا مفاتيح خاصة — لا سحب — قراءة فقط

const TON_API = 'https://tonapi.io/v2';
const TON_USDT_MASTER = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
const BASE_RPC = 'https://mainnet.base.org';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const TON_ADDRESS = process.env.USDT_RECEIVE_ADDRESS || 'UQCmuxmPwCwBxYchu6rXNP90Va0MqP1RD3kzGaTbEHb70Z1f';
const BASE_ADDRESS = process.env.USDC_RECEIVE_ADDRESS || '0x9d27c8bc594dcead76d2bb6d2390d4904a7a0855';

function formatUnits(raw, decimals) {
  if (raw === null || raw === undefined) return '0';
  const s = String(raw);
  if (decimals === 0) return s;
  const padded = s.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const frac = padded.slice(-decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

export async function getTonWallet() {
  const address = TON_ADDRESS;
  if (!address) return { network: 'TON', address: '', tokens: [], error: 'العنوان غير مُعد' };
  try {
    const account = await fetchJson(`${TON_API}/accounts/${address}`);
    const tonBalance = formatUnits(account.balance || '0', 9);

    let usdtBalance = '0';
    try {
      const jetton = await fetchJson(`${TON_API}/accounts/${address}/jettons/${TON_USDT_MASTER}`);
      usdtBalance = formatUnits(jetton.balance || '0', 6);
    } catch { /* لم يُستقبل USDT بعد */ }

    return {
      network: 'TON',
      address,
      tokens: [
        { symbol: 'TON', balance: tonBalance },
        { symbol: 'USDT', balance: usdtBalance }
      ],
      explorer: `https://tonviewer.com/${address}`
    };
  } catch (e) {
    return { network: 'TON', address, tokens: [], error: e.message };
  }
}

export async function getBaseWallet() {
  const address = BASE_ADDRESS;
  if (!address) return { network: 'Base', address: '', tokens: [], error: 'العنوان غير مُعد' };
  try {
    const ethRes = await fetchJson(BASE_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_getBalance',
        params: [address, 'latest']
      })
    });
    const ethBalance = formatUnits(BigInt(ethRes.result || '0x0').toString(), 18);

    const data = '0x70a08231' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const usdcRes = await fetchJson(BASE_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'eth_call',
        params: [{ to: BASE_USDC, data }, 'latest']
      })
    });
    const usdcBalance = formatUnits(BigInt(usdcRes.result || '0x0').toString(), 6);

    return {
      network: 'Base',
      address,
      tokens: [
        { symbol: 'ETH', balance: ethBalance },
        { symbol: 'USDC', balance: usdcBalance }
      ],
      explorer: `https://basescan.org/address/${address}`
    };
  } catch (e) {
    return { network: 'Base', address, tokens: [], error: e.message };
  }
}

export async function getAllWallets() {
  const [ton, base] = await Promise.all([getTonWallet(), getBaseWallet()]);
  return {
    ok: true,
    wallets: { ton, base },
    fetchedAt: new Date().toISOString()
  };
}

export async function startWalletMonitors() {
  return { ok: true, note: 'wallet monitors disabled (read-only mode)' };
}
