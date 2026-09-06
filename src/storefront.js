import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';

const root = path.resolve(import.meta.dirname, '..');

export const PRODUCTS = [
  { id: '1', name: '📖 قاموس مصطلحات Web3 (250+ مصطلح، عربي/إنجليزي)', price: 15, stars: 750 },
  { id: '2', name: '🎓 دورة أساسيات DePIN (5 محطات)', price: 25, stars: 1250 },
  { id: '3', name: '✍️ حزمة كتابة محتوى Web3 (10 قوالب)', price: 35, stars: 1750 },
  { id: '4', name: '🔐 شرح العقد الذكي للمبتدئين', price: 20, stars: 1000 },
  { id: '5', name: '🗂️ حزمة تقديم الوظائف Web3 (3 حزم)', price: 30, stars: 1500 },
  { id: '6', name: '📊 تحليل الأمن والاقتصاد الرمزي (عيّنة + منهجية)', price: 40, stars: 2000 }
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


export function deliveryPackPath(productId) {
  if (!fs.existsSync) return null;
  const candidates = fs.readdirSync(path.join(root, 'store-delivery'));
  const match = candidates.find(f => f.startsWith(`product-${productId}-`));
  return match ? path.join(root, 'store-delivery', match) : null;
}

export function confirmOrderPaid(orderId, txid) {
  const order = db.prepare('SELECT * FROM store_orders WHERE id = ?').get(orderId);
  if (!order) return { ok: false, error: 'ORDER_NOT_FOUND' };
  if (order.status !== 'awaiting_payment' && order.status !== 'paid') return { ok: false, error: `BAD_STATUS_${order.status}` };
  db.prepare("UPDATE store_orders SET status='paid', txid=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(txid || order.txid || '', orderId);
  const pack = deliveryPackPath(order.product_id);
  if (pack) {
    db.prepare("UPDATE store_orders SET status='delivered', delivered_file=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(pack, orderId);
    return { ok: true, orderId, status: 'delivered', deliveredFile: pack };
  }
  return { ok: true, orderId, status: 'paid', note: 'ملف التسليم سيُرفق يدوياً' };
}

export function ordersSummary() {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count, COALESCE(SUM(price), 0) AS total
    FROM store_orders GROUP BY status
  `).all();
  if (!rows.length) return 'لا توجد طلبات بعد.';
  const realTotal = db.prepare(`SELECT COALESCE(SUM(price),0) AS t FROM store_orders WHERE status IN ('paid','delivered') AND (payment_note IS NULL OR payment_note != 'TEST-RECORD-FOR-DEMO')`).get().t;
  const testCount = db.prepare(`SELECT COUNT(*) c FROM store_orders WHERE payment_note = 'TEST-RECORD-FOR-DEMO'`).get().c;
  return rows.map(r => `${r.status === 'awaiting_payment' ? '⏳ بانتظار الدفع' : r.status === 'paid' ? '✅ مدفوع' : r.status}: ${r.count} طلب — ${r.total}$`).join('\n')
    + `\n💰 إجمالي الإيراد الفعلي: ${realTotal}$` + (testCount ? `\n🧪 سجلات اختبار فقط: ${testCount}` : '');
}

/** Telegram Stars (XTR) payment — fully automated, no provider needed */
export function starsPaymentInfo() {
  return PRODUCTS.map(p => `${p.id}) ${p.name} — ${p.stars} ⭐`).join('\n');
}

export function sendInvoiceArgs(chatId, productId) {
  const product = PRODUCTS.find(p => p.id === String(productId));
  if (!product) return null;
  return {
    chat_id: chatId,
    title: product.name.replace(/^[^\w\u0600-\u06FF]+\s*/, ''),
    description: `منتج رقمي فوري — يُسلّم مباشرة بعد الدفع عبر النجوم ⭐`,
    payload: JSON.stringify({ product_id: product.id, product_name: product.name }),
    currency: 'XTR',
    prices: [{ label: product.name.replace(/^[^\w\u0600-\u06FF]+\s*/, '').slice(0, 50), amount: product.stars }],
    provider_token: '',
    need_name: false,
    need_email: false,
    need_phone_number: false,
    need_shipping_address: false,
    send_email_to_provider: false,
    is_flexible: false,
    photo_url: 'https://mohammadassia993-jpg.github.io/aurora-bot-render/logo.png',
    photo_width: 512,
    photo_height: 512
  };
}

export function handleSuccessfulPayment(payment, sender) {
  let productId, productName;
  try {
    const payload = JSON.parse(payment.invoice_payload || '{}');
    productId = payload.product_id;
    productName = payload.product_name;
  } catch {
    return '❌ خطأ في تحليل الدفع.';
  }
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return '❌ منتج غير معروف.';
  const stars = payment.total_amount;
  
  // Record the order
  db.prepare(`
    INSERT INTO store_orders(product_id, product_name, price, customer_name, customer_chat_id, status, txid, payment_note)
    VALUES (?, ?, ?, ?, ?, 'paid', ?, 'TELEGRAM_STARS')
  `).run(productId, productName, product.price, sender.username || sender.id || '', String(sender.id || ''), payment.telegram_payment_charge_id || 'XTR-' + Date.now());
  
  const packPath = deliveryPackPath(productId);
  if (packPath) {
    db.prepare("UPDATE store_orders SET status='delivered', delivered_file=?, updated_at=CURRENT_TIMESTAMP WHERE id=last_insert_rowid()").run(packPath);
  }
  
  return [
    '✅ تم الدفع بنجاح عبر النجوم ⭐!',
    `📦 المنتج: ${product.name}`,
    `💰 المبلغ: ${stars} ⭐`,
    `🧾 رقم المعاملة: ${payment.telegram_payment_charge_id || '-'}`,
    '',
    '📥 جارٍ تجهيز الملفات...',
    packPath ? '✅ جاهز! الملفات سترسل فوراً.' : '⏳ الملفات ستُجهّز وترسل خلال دقائق.'
  ].join('\n');
}
export const SUBSCRIPTION = {
  id: 'sub',
  name: '🎯 اشتراك محتوى Web3 الشهري',
  description: '5 مقالات + 3 ترجمات + تقرير أسبوعي + دعم مباشر',
  monthlyPrice: 500,
  monthlyStars: 25000,
  features: [
    '📝 5 مقالات تقنية عربية شهرياً',
    '🔄 3 ترجمات EN→AR شهرياً',
    '📊 تقرير أسبوعي عن أحدث التطورات',
    '💬 دعم مباشر عبر البوت',
    '📦 تحديثات مستمرة مجانية'
  ]
};

export function subscriptionInfo() {
  return [
    '🎯 اشتراك محتوى Web3 الشهري',
    '',
    '📋 ما تحصل عليه:',
    ...SUBSCRIPTION.features,
    '',
    `💰 السعر: ${SUBSCRIPTION.monthlyPrice}$ / شهرياً أو ${SUBSCRIPTION.monthlyStars} ⭐`,
    '',
    '📝 للاشتراك: اكتب /subscribe إلى البوت',
    '📩 أو تواصل معنا: @Aurora_Almada_88_Bot'
  ].join('\n');
}
