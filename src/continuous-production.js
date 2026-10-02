/**
 * continuous-production.js — Continuous Production Engine (FIXED)
 *
 * الإصلاحات:
 * 1. Kill switch فوري في بداية الدالة
 * 2. عدّاد فشل متتالي — يتوقف بعد 3 فشلات
 * 3. تتبّع المنتجات الفاشلة — لا يكرر نفس المنتج
 * 4. توقف تلقائي عند نفاد الرصيد
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { callModel } from './ai.js';
import { config } from './config.js';
import { sendMessageDetailed } from './telegram.js';
import { info, warn } from './logger.js';
import { eventBus, EVENTS } from './event-bus.js';
import { EpisodicMemory } from './persistent-memory.js';
import { STYLE_GUIDE } from './production.js';

const PROD_DIR = path.join(config.root, 'data', 'production');
const PRODUCTS_DIR = path.join(PROD_DIR, 'output');
const CATALOG_FILE = path.join(PROD_DIR, 'catalog.json');
fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

const PRODUCTION_SAMPLES_ENABLED = process.env.PRODUCTION_SAMPLES_ENABLED === 'true';

const SIMULATION_PATTERNS = [
  'وضع المحاكاة',
  'لم يتم الاتصال بمزود AI',
  'أنا أورورا في وضع',
  'local-deterministic'
];

function isSimulationContent(text) {
  const lower = String(text);
  return SIMULATION_PATTERNS.some(p => lower.includes(p));
}

const PRODUCT_IDEAS = {
  template: [
    { title: 'قالب عرض تقديمي Web3', desc: 'قالب PowerPoint/Google Slides لعروض Web3 احترافية', price: 12, format: 'pptx' },
    { title: 'قالب اتفاقية عقود ذكية', desc: 'قالب PDF لاتفاقيات العقود الذكية بالعربية', price: 15, format: 'pdf' },
    { title: 'قالب خطة تسويقية DePIN', desc: 'قالب خطة تسويقية لمشاريع DePIN', price: 18, format: 'pdf' },
    { title: 'قالب عرض بيانات التمويل', desc: 'قالب Pitch Deck لمشاريع البلوكتشين', price: 20, format: 'pptx' },
    { title: 'قالب تقرير تحليلي', desc: 'قالب تقرير تحليلي احترافي بالعربية', price: 10, format: 'pdf' }
  ],
  ebook: [
    { title: 'دليل المبتدئين في DePIN', desc: 'كتاب إلكتروني شامل عن شبكات DePIN', price: 25, format: 'pdf' },
    { title: 'دليل العقود الذكية', desc: 'دليل شامل للعقود الذكية للمبتدئين', price: 20, format: 'pdf' },
    { title: 'أمان المحافظ الرقمية', desc: 'دليل أمن المحافظ الرقمية', price: 15, format: 'pdf' },
    { title: 'قنوات الدخل من Web3', desc: 'أساليب ربح الدخل من منصات Web3', price: 30, format: 'pdf' },
    { title: 'دليل التحليل الفني للرموز', desc: 'أساسيات التحليل الفني لأسواق العملات الرقمية', price: 22, format: 'pdf' }
  ],
  svg: [
    { title: 'مجموعة أيقونات Web3', desc: '30 أيقونة SVG لمفاهيم Web3', price: 8, format: 'svg' },
    { title: 'مجموعة أقسام العروض التقديمية', desc: '50 قسم SVG احترافي', price: 12, format: 'svg' },
    { title: 'أيقونات الشبكات اللامركزية', desc: '20 أيقونة لشبكات DePIN', price: 10, format: 'svg' }
  ],
  mini_course: [
    { title: 'دورة أساسيات البلوكتشين', desc: '5 محطات تعليمية بالفيديو', price: 35, format: 'video' },
    { title: 'دورة إنشاء العقود الذكية', desc: '7 محطات عملية بالفيديو', price: 45, format: 'video' },
    { title: 'دورة التحليل الفني', desc: '6 محطات مع تطبيقات عملية', price: 40, format: 'video' }
  ],
  audio: [
    { title: 'بودكاست Web3 أسبوعي - الحلقة 1', desc: 'ملف صوتي عن أخبار Web3', price: 5, format: 'mp3' },
    { title: 'ملف صوتي: مقدمة في DeFi', desc: 'شرح صوتي شامل عن DeFi', price: 8, format: 'mp3' }
  ],
  digital_art: [
    { title: 'مجموعة خلفيات Web3', desc: '10 خلفيات عالية الدقة', price: 10, format: 'png' },
    { title: 'أفاتارات رقمية', desc: '5 أفاتارات فنية رقمية', price: 15, format: 'png' }
  ],
  simple_software: [
    { title: 'حاسبة محافظ Web3', desc: 'أداة بسيطة لحساب محفظة رقمية', price: 20, format: 'js' },
    { title: 'مولد عناوين محافظ', desc: 'أداة لإنشاء عناوين محافظ اختبارية', price: 12, format: 'js' }
  ],
  '3d_file': [
    { title: 'نموذج شعار عمالقة الصمت', desc: 'ملف 3D للشعار', price: 15, format: 'obj' },
    { title: 'أيقونة محفظة رقمية 3D', desc: 'نموذج 3D لمحفظة رقمية', price: 10, format: 'obj' }
  ]
};

let productionCount = 0;
let running = false;
const failedIdeas = new Set(); // 🆕 تتبّع المنتجات الفاشلة

function getNextIdea() {
  const catalog = loadCatalog();
  const usedTitles = new Set(catalog.map(p => p.title));
  for (const [type, ideas] of Object.entries(PRODUCT_IDEAS)) {
    for (const idea of ideas) {
      // 🆕 تجنب المنتجات الفاشلة + المستخدمة
      if (!usedTitles.has(idea.title) && !failedIdeas.has(idea.title)) {
        return { ...idea, type };
      }
    }
  }
  return null;
}

function loadCatalog() {
  try {
    if (fs.existsSync(CATALOG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
      return Array.isArray(raw) ? raw : (raw.catalog || raw.products || []);
    }
  } catch {}
  return [];
}

function saveCatalog(catalog) {
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), { mode: 0o600 });
}

async function generateProduct(idea) {
  info('production', `🏭 Generating: ${idea.title} (${idea.type})`);

  const prompt = `أنت كاتب متخصص في Web3 وبلوكتشين. اكتب ${idea.type === 'ebook' ? 'كتاباً إلكترونياً' : idea.type === 'template' ? 'قالباً احترافياً' : 'منتجاً رقمياً'} بالعربية الفصحى.

العنوان: ${idea.title}
الوصف: ${idea.desc}

الأسلوب: ${STYLE_GUIDE.tone}

اكتب محتوى احترافي.`;

  try {
    const content = await callModel('production', prompt);
    const cleanContent = String(content).trim();

    if (isSimulationContent(cleanContent)) {
      warn('production', `⛔ محتوى محاكاة مرفوض`);
      return null;
    }

    if (cleanContent.length < 100) {
      warn('production', `Content too short: ${cleanContent.length} chars`);
      return null;
    }

    const filename = `${idea.type}_${Date.now()}.${idea.format}`;
    const filepath = path.join(PRODUCTS_DIR, filename);
    fs.writeFileSync(filepath, cleanContent, 'utf8');

    const product = {
      id: `prod_${Date.now()}`,
      title: idea.title,
      description: idea.desc,
      type: idea.type,
      format: idea.format,
      price: idea.price,
      filename,
      filepath,
      status: 'draft',
      approvalStatus: 'pending',
      createdAt: new Date().toISOString(),
      contentLength: cleanContent.length
    };

    const catalog = loadCatalog();
    catalog.push(product);
    saveCatalog(catalog);

    db.prepare(`
      INSERT INTO tasks(source, title, reward, fit_score, status, payload_json)
      VALUES ('production', ?, ?, 0.8, 'drafted', ?)
    `).run(idea.title, idea.price, JSON.stringify(product));

    productionCount++;
    info('production', `✅ Generated: ${idea.title} (${cleanContent.length} chars)`);

    EpisodicMemory.record('product_created', 'production', null, idea.title, `Type: ${idea.type}`, 'success');

    return product;
  } catch (e) {
    warn('production', `Failed to generate ${idea.title}: ${e.message}`);
    return null;
  }
}

export async function startContinuousProduction() {
  // 🛡️ الحماية 1: Kill switch إجباري
  if (process.env.CONTINUOUS_PRODUCTION_ENABLED === 'false') {
    info('production', '⏸ Continuous production DISABLED by env (leader order)');
    return;
  }

  if (running) {
    info('production', '⚠️ Production already running');
    return;
  }

  running = true;
  info('production', '🚀 Starting continuous production engine...');

  let consecutiveFailures = 0; // 🆕
  const MAX_FAILURES = 3;

  while (running) {
    const idea = getNextIdea();
    if (!idea) {
      info('production', '📦 All product ideas exhausted. Stopping.');
      break;
    }

    const product = await generateProduct(idea);

    if (product) {
      consecutiveFailures = 0; // ✅ نجاح — نُصفّر
      if (productionCount % 10 === 0 && PRODUCTION_SAMPLES_ENABLED) {
        await sendApprovalSample(product);
      }
    } else {
      // 🛡️ الحماية 2: تتبّع الفشل — لا تكرر نفس المنتج
      failedIdeas.add(idea.title);
      consecutiveFailures++;
      warn('production', `Failed idea added to blacklist: "${idea.title}". Consecutive failures: ${consecutiveFailures}`);

      // 🛡️ الحماية 3: توقف عند 3 فشلات متتالية
      if (consecutiveFailures >= MAX_FAILURES) {
        warn('production', `🛑 STOPPED after ${MAX_FAILURES} consecutive failures (AI provider exhausted)`);
        sendMessageDetailed(
          `🛑 **Production STOPPED**\n\n` +
          `السبب: ${MAX_FAILURES} فشلات متتالية\n` +
          `Cloudflare أو مزود AI استُنزف\n\n` +
          `المنتجات المُنتجة: ${productionCount}\n` +
          `الفاشلة: ${failedIdeas.size}`,
          config.telegramChatId
        ).catch(() => {});
        break;
      }
    }

    await new Promise(r => setTimeout(r, 5000));
  }

  running = false;
  info('production', `⏹ Production stopped. Generated: ${productionCount}, Failed: ${failedIdeas.size}`);
}

async function sendApprovalSample(product) {
  try {
    const content = fs.readFileSync(product.filepath, 'utf8');
    if (isSimulationContent(content)) return;
    const preview = content.slice(0, 1500);
    await sendMessageDetailed(`📦 عينة: ${product.title}\n\n${preview}`, config.telegramChatId);
  } catch (e) {
    warn('production', `Failed to send sample: ${e.message}`);
  }
}

export function getProductionStats() {
  const catalog = loadCatalog();
  return {
    total: catalog.length,
    draft: catalog.filter(p => p.status === 'draft').length,
    approved: catalog.filter(p => p.approvalStatus === 'approved').length,
    pending: catalog.filter(p => p.approvalStatus === 'pending').length,
    published: catalog.filter(p => p.status === 'published').length,
    running,
    productionCount,
    failedIdeas: failedIdeas.size
  };
}

export function stopContinuousProduction() {
  running = false;
  info('production', '⏹ Stopping continuous production...');
}

export default { startContinuousProduction, stopContinuousProduction, getProductionStats };
