import { config } from './config.js';
import { db } from './db.js';
import { notify } from './notifications.js';
import { recordError } from './db.js';

const USDC_BASE_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function getJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function saveEvent({ network, symbol, amount, address, txHash, confirmed = true, metadata = {} }) {
  if (!txHash || !Number.isFinite(amount) || amount <= 0) return false;
  const existing = db.prepare('SELECT id FROM wallet_events WHERE tx_hash=?').get(txHash);
  if (existing) return false;
  db.prepare(`
    INSERT INTO wallet_events(asset,network,symbol,amount,address,tx_hash,confirmed)
    VALUES (?,?,?,?,?,?,?)
  `).run(symbol, network, symbol, amount, address, txHash, confirmed ? 1 : 0);
  await notify(
    'wallet_received',
    `💰 استلام ${amount} ${symbol} على ${network}`,
    `المبلغ: ${amount} ${symbol}\nالشبكة: ${network}\nالعنوان: ${address}\nالتوقيع: ${txHash}`
  );
  return true;
}

async function monitorBase() {
  const address = config.usdcBaseAddress;
  if (!address) return;
  const usdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  let items = [];
  try {
    const data = await getJson(`${config.baseRpcUrl.replace(/\/$/, '')}/addresses/${address}/token-transfers?type=ERC-20`);
    for (const item of data.items || []) {
      const matches = item.to?.hash?.toLowerCase() === address.toLowerCase();
      const isUsdc = item.token?.symbol?.toUpperCase() === 'USDC' || item.token?.address?.toLowerCase() === usdc.toLowerCase();
      if (matches && isUsdc) items.push({
        hash: item.transaction_hash, value: item.total.value,
        time: item.timestamp, block: item.block_number
      });
    }
  } catch {
    const fallback = await getJson(`${config.baseRpcUrl.replace(/\/$/, '')}/api?module=account&action=tokentx&contractaddress=${usdc}&address=${address}&page=1&offset=50&sort=desc`);
    if (fallback.status === '1') {
      items = (fallback.result || []).filter(item => item.to?.toLowerCase() === address.toLowerCase()).map(item => ({
        hash: item.hash, value: String(Number(item.value) / 10 ** Number(item.tokenDecimal || 6)),
        time: Number(item.timeStamp) ? new Date(Number(item.timeStamp) * 1000).toISOString() : '', block: item.blockNumber
      }));
    }
  }
  for (const item of items) {
    await saveEvent({
      network: 'Base', symbol: 'USDC', amount: Number(item.value || 0),
      address, txHash: item.hash, metadata: { block: item.block, time: item.time }
    });
  }
}

async function monitorSolana() {
  const address = config.usdcSolanaAddress;
  if (!address) return;
  const signatures = await getJson(config.solanaRpcUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'aurora', method: 'getSignaturesForAddress', params: [address, { limit: 20 }] })
  });
  for (const signature of signatures.result || []) {
    if (signature.err) continue;
    const txHash = signature.signature;
    if (db.prepare('SELECT id FROM wallet_events WHERE tx_hash=?').get(txHash)) continue;
    const transaction = await getJson(config.solanaRpcUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'aurora', method: 'getTransaction', params: [txHash, 'jsonParsed'] })
    });
    const meta = transaction.result?.meta;
    const pre = meta?.preTokenBalances || [];
    const post = meta?.postTokenBalances || [];
    for (const after of post) {
      if (after.mint !== USDC_BASE_MINT || after.owner !== address) continue;
      const before = pre.find(item => item.accountKey === after.accountKey && item.mint === after.mint);
      const delta = Number(after.uiTokenAmount?.uiAmount || 0) - Number(before?.uiTokenAmount?.uiAmount || 0);
      if (delta > 0) await saveEvent({ network: 'Solana', symbol: 'USDC', amount: delta, address, txHash });
    }
  }
}

async function monitorTon() {
  const address = config.usdtTonAddress;
  if (!address) return;
  const data = await getJson(`${config.tonApiUrl.replace(/\/$/, '')}/transactions?account=${encodeURIComponent(address)}&limit=20`);
  for (const tx of data.transactions || []) {
    const incoming = Number(tx.in_msg?.value || 0) / 1_000_000_000;
    if (incoming > 0 && !tx.in_msg?.source) continue;
    await saveEvent({
      network: 'TON', symbol: 'TON', amount: incoming,
      address, txHash: tx.hash, metadata: { uxtime: tx.utime }
    });
  }
}

export async function pollWallets() {
  const result = {};
  for (const [name, operation] of [
    ['base', monitorBase], ['solana', monitorSolana], ['ton', monitorTon]
  ]) {
    try {
      await operation();
      result[name] = 'ok';
    } catch (caught) {
      result[name] = caught.message;
      recordError(`wallet_${name}`, caught.name === 'TimeoutError' ? 'TIMEOUT' : 'MONITOR_ERROR', caught.message, {}, 'Will retry next cycle');
    }
  }
  return result;
}

export function startWalletMonitors(minutes = config.walletPollMinutes) {
  setInterval(() => pollWallets().catch(() => {}), Math.max(1, minutes) * 60_000).unref();
}
