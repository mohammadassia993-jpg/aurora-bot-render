// wallets module v2 // v3 // v4
const TON_ADDRESS = 'UQCmuxmPwCwBxYchu6rXNP90Va0MqP1RD3kzGaTbEHb70Z1f';
const BASE_ADDRESS = '0x9d27c8bc594dcead76d2bb6d2390d4904a7a0855';
const TON_USDT = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

function fmt(raw, dec) {
  if (!raw) return '0';
  const s = String(raw).padStart(dec + 1, '0');
  const whole = s.slice(0, -dec) || '0';
  const frac = s.slice(-dec).replace(/0+$/, '');
  return frac ? whole + '.' + frac : whole;
}

async function fetchJson(url, options, timeout = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...options, signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function getTon() {
  try {
    const acc = await fetchJson('https://tonapi.io/v2/accounts/' + TON_ADDRESS);
    const ton = fmt(acc.balance || '0', 9);
    let usdt = '0';
    try {
      const j = await fetchJson('https://tonapi.io/v2/accounts/' + TON_ADDRESS + '/jettons/' + TON_USDT);
      usdt = fmt(j.balance || '0', 6);
    } catch (e) {}
    return { network: 'TON', symbol: 'USDT', balance: usdt, native: 'TON', nativeBalance: ton, address: TON_ADDRESS };
  } catch (e) {
    return { network: 'TON', symbol: 'USDT', balance: '0', native: 'TON', nativeBalance: '0', address: TON_ADDRESS, note: 'لم يُستقبل بعد' };
  }
}

async function getBase() {
  try {
    const r = await fetchJson('https://mainnet.base.org', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [BASE_ADDRESS, 'latest'] })
    });
    const eth = fmt(BigInt(r.result || '0x0').toString(), 18);
    const data = '0x70a08231' + BASE_ADDRESS.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const u = await fetchJson('https://mainnet.base.org', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: BASE_USDC, data }, 'latest'] })
    });
    const usdc = fmt(BigInt(u.result || '0x0').toString(), 6);
    return { network: 'Base', symbol: 'USDC', balance: usdc, native: 'ETH', nativeBalance: eth, address: BASE_ADDRESS };
  } catch (e) {
    return { network: 'Base', symbol: 'USDC', balance: '0', native: 'ETH', nativeBalance: '0', address: BASE_ADDRESS, note: 'لم يُستقبل بعد' };
  }
}

export async function getAllWallets() {
  const [ton, base] = await Promise.all([getTon(), getBase()]);
  return { ok: true, wallets: [ton, base], fetchedAt: new Date().toISOString() };
}

export async function getTonWallet() { return getTon(); }
export async function getBaseWallet() { return getBase(); }
export async function startWalletMonitors() { return { ok: true }; }
