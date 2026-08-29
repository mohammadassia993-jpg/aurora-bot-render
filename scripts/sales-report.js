// Sales monitor: sends daily sales summary to leader via Telegram
import { db } from '../src/db.js';
import { config } from '../src/config.js';
import https from 'node:https';

const botToken = config.telegramToken;
const chatId = config.telegramChatId;
if (!botToken || !chatId) { process.exit(0); }

const today = db.prepare(`
  SELECT COUNT(*) AS count, COALESCE(SUM(price),0) AS total
  FROM store_orders WHERE date(updated_at) = date('now') AND status IN ('paid','delivered')
`).get();
const awaiting = db.prepare(`SELECT COUNT(*) AS c FROM store_orders WHERE status='awaiting_payment'`).get().c;
const allPaid = db.prepare(`SELECT COALESCE(SUM(price),0) AS t FROM store_orders WHERE status IN ('paid','delivered')`).get().t;

const text = `📊 تقرير المبيعات اليومي (${new Date().toISOString().slice(0,10)}):\n\n• مبيعات اليوم: ${today.count} طلب — ${today.total}$\n• بانتظار الدفع: ${awaiting}\n• إجمالي المبيعات المؤكدة: ${allPaid}$\n\nالمتجر: https://mohammadassia993-jpg.github.io/aurora-bot-render/\n— أورورا`;

const body = JSON.stringify({ chat_id: chatId, text });
function attempt(host) {
  return new Promise(resolve => {
    const req = https.request({ hostname: host, servername: host, path: `/bot${botToken}/sendMessage`, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), host: 'api.telegram.org' }, timeout: 12000 }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try { const j=JSON.parse(d); resolve(j.ok); } catch { resolve(false); } }); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.write(body); req.end();
  });
}
attempt('api.telegram.org').then(ok => { console.log(ok ? 'sales report sent' : 'failed'); process.exit(0); });
