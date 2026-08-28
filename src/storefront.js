import { db } from './db.js';

export const PRODUCTS = [
  { id: '1', name: '📖 قاموس مصطلحات Web3 (250+ مصطلح، عربي/إنجليزي)', price: 15 },
  { id: '2', name: '🎓 دورة أساسيات DePIN (5 محطات)', price: 25 },
  { id: '3', name: '✍️ حزمة كتابة محتوى Web3 (10 قوالب)', price: 35 },
  { id: '4', name: '🔐 شرح العقد الذكي للمبتدئين', price: 20 },
  { id: '5', name: '🗂️ حزمة تقديم الوظائف Web3 (3 حزم)', price: 30 },
  { id: '6', name: '📊 تحليل الأمن والاقتصاد الرمزي (عيّنة + منهجية)', price: 40 }
];

const USDT_ADDRESS = 'UQCmuxmPwCwBxYchu6rXNP90Va0MqPlRD3kzGaTbEHb70Z1f';
const USDC_ADDRESS = '0x9d27c8bc594dcead76d2bb6d2390d4904a7a0855';


export function paymentReceiptReply(message, sender = {}) {
  const text = String(message || '').trim();
  const isReceipt = /(دفعت|حولت|أرسلت|ارسلت|تحويل|TXID|txid|إيصال|ايصال|رمز التحويل|تم الدفع|توكن|hash)/.test(text);
  if (!isReceipt) return null;
  const pending = db.prepare(`
    SELECT * FROM store_orders
    WHERE status = 'awaiting_payment'
    ORDER BY id DESC LIMIT 1
  `).get();
  if (!pending) {
    return 'لم أجد طلباً بانتظار الدفع. ابدأ بـ «اشتري <رقم>» لاختيار منتج.';
  }
  const txidMatch = text.match(/[0-9a-fA-F]{16,}|UQ[0-9A-Za-z]{20,}|[0-9a-fA-F]{40,}/);
  const txid = txidMatch ? txidMatch[0] : text.slice(0, 60);
  db.prepare(`
    UPDATE store_orders
    SET status = 'paid', txid = ?, payment_note = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(txid, text.slice(0, 200), pending.id);
  return [
    `✅ تم تسجيل إيصال طلب #${pending.id}: ${pending.product_name}`,
    `💰 المبلغ: ${pending.price}$`,
    `🧾 المرجع: ${txid}`,
    'جدولنا التحقق من التحويل (عادة خلال ساعة). ستصلك ملفاتك فور التأكيد.',
    'يُحتفظ بالطلب في النظام كسجل مبيعات.'
  ].join('\n');
}

export function productCatalogue() {
  return PRODUCTS.map(p => `${p.id}) ${p.name} — ${p.price}$`).join('\n');
}

export function paymentInfo() {
  return [
    '💳 طرق الدفع:',
    `• USDT (TON): \`${USDT_ADDRESS}\``,
    `• USDC (Base): \`${USDC_ADDRESS}\``,
    'بعد الدفع أرسل رقم المنتج + لقطة/رقم التحويل (TXID) هنا.'
  ].join('\n');
}

export function orderPromptReply(message, sender = {}) {
  const text = String(message || '').trim();
  // Match an order like "اشتري 2" / "أريد المنتج 3" / "شراء 1"
  const buyRe = /(?:اشتري|أريد|طلب|شراء|اريد|احجز|اشتريت)[^0-9]*(\d{1,2})/i;
  const match = text.match(buyRe);
  const product = PRODUCTS.find(p => p.id === match?.[1]);
  if (product) {
    db.prepare(`
      INSERT INTO store_orders(product_id, product_name, price, customer_name, customer_chat_id, status)
      VALUES (?, ?, ?, ?, ?, 'awaiting_payment')
    `).run(product.id, product.name, product.price, sender.username || '', String(sender.id || ''));
    return [
      `✅ تم تسجيل طلبك: ${product.name}`,
      `💰 المطلوب: ${product.price}$`,
      '',
      paymentInfo(),
      '',
      'أرسل إيصال التحويل (TXID أو لقطة) بعد الدفع وسنؤكد الطلب فوراً.'
    ].join('\n');
  }
  return null;
}

export function ordersSummary() {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count, COALESCE(SUM(price), 0) AS total
    FROM store_orders GROUP BY status
  `).all();
  if (!rows.length) return 'لا توجد طلبات بعد.';
  return rows.map(r => `${r.status === 'awaiting_payment' ? '⏳ بانتظار الدفع' : r.status === 'paid' ? '✅ مدفوع' : r.status}: ${r.count} طلب — ${r.total}$`).join('\n') + `\nإجمالي مبيعات: ${db.prepare(`SELECT COALESCE(SUM(price),0) AS t FROM store_orders WHERE status IN ('paid','delivered')`).get().t}$`;
}
