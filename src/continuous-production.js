/**
 * continuous-production.js — Continuous Production Engine
 *
 * Produces digital products non-stop across 3 categories:
 * - Fast: templates, ebooks, SVG files
 * - Medium: mini-courses, audio/video, digital art
 * - Technical: simple software, 3D files
 *
 * Speed: 3 templates or ebooks every 30 minutes
 * Approval: 1-of-10 sampling (show 1 product per 10 for leader review)
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { callModel } from './ai.js';
import { config } from './config.js';
import { sendMessageDetailed } from './telegram.js';
import { info, warn } from './logger.js';
import { eventBus, EVENTS } from './event-bus.js';
import { EpisodicMemory, SemanticMemory } from './persistent-memory.js';
import { STYLE_GUIDE } from './production.js';

const PROD_DIR = path.join(config.root, 'data', 'production');
const PRODUCTS_DIR = path.join(PROD_DIR, 'output');
const CATALOG_FILE = path.join(PROD_DIR, 'catalog.json');
fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

// ── Product Categories (per Kimi's plan) ──
const CATEGORIES = {
  fast: {
    name: 'الأسرع',
    types: ['template', 'ebook', 'svg'],
    batchSize: 3,
    intervalMinutes: 30,
    description: 'قوالب، كتب إلكترونية، ملفات SVG'
  },
  medium: {
    name: 'المتوسطة',
    types: ['mini_course', 'audio', 'digital_art'],
    batchSize: 1,
    intervalMinutes: 60,
    description: 'دورات مصغرة، ملفات صوتية/فيديو، فن رقمي'
  },
  technical: {
    name: 'التقنية',
    types: ['simple_software', '3d_file'],
    batchSize: 1,
    intervalMinutes: 120,
    description: 'برمجيات بسيطة، ملفات ثلاثية الأبعاد'
  }
};

// ── Product Templates for each type ──
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
    { title: '规矩书 العقود الذكية', desc: 'دليل شامل للعقود الذكية للمبتدئين', price: 20, format: 'pdf' },
    { title: '安全管理 أصولك الرقمية', desc: 'دليل أمن المحافظ الرقمية والqmprotect', price: 15, format: 'pdf' },
    { title: 'قناة الدخل من Web3', desc: 'أساليب ربح الدخل من منصات Web3', price: 30, format: 'pdf' },
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
    { title: 'بودكاست Web3 أسبوعي - الحلقية 1', desc: 'ملف صوتي عن أخبار Web3', price: 5, format: 'mp3' },
    { title: 'ملف صوتي: مقدمة في DeFi', desc: 'شرح صوتي شامل عن DeFi', price: 8, format: 'mp3' }
  ],
  digital_art: [
    { title: 'مجموعة خلفيات Web3', desc: '10 خلفيات عالية الدقة', price: 10, format: 'png' },
    { title: 'أفاتارات رقمية', desc: '5 أفاتارات فنية رقمية', price: 15, format: 'png' }
  ],
  simple_software: [
    { title: 'حاسبة محافظ Web3', desc: 'أداة بسيطة ل计算 محفظة رقمية', price: 20, format: 'js' },
    { title: 'مولد عناوين محافظ', desc: 'أداة لإنشاء عناوين محافظ اختبارية', price: 12, format: 'js' }
  ],
  '3d_file': [
    { title: 'نموذج شعار عمالقة الصمت', desc: 'ملف 3D للشعار', price: 15, format: 'obj' },
    { title: 'أيقونة محفظة رقمية 3D', desc: 'نموذج 3D لمحفظة رقمية', price: 10, format: 'obj' }
  ]
};

let productionCount = 0;
let running = false;

/** Get next product idea from catalog (avoid duplicates) */
function getNextIdea() {
  const catalog = loadCatalog();
  const usedTitles = new Set(catalog.map(p => p.title));

  for (const [type, ideas] of Object.entries(PRODUCT_IDEAS)) {
    for (const idea of ideas) {
      if (!usedTitles.has(idea.title)) {
        return { ...idea, type };
      }
    }
  }
  return null;
}

/** Load or initialize catalog */
function loadCatalog() {
  try {
    if (fs.existsSync(CATALOG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
      return Array.isArray(raw) ? raw : (raw.catalog || raw.products || []);
    }
  } catch {}
  return [];
}

/** Save catalog */
function saveCatalog(catalog) {
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), { mode: 0o600 });
}

/** Generate a single product */
async function generateProduct(idea) {
  info('production', `🏭 Generating: ${idea.title} (${idea.type})`);

  const prompt = `أنت كاتب متخصص في Web3 وبلوكتشين. اكتب ${idea.type === 'ebook' ? 'كتاباً إلكترونياً' : idea.type === 'template' ? 'قالباً احترافياً' : 'منتجاً رقمياً'} بالعربية الفصحى.

العنوان: ${idea.title}
الوصف: ${idea.desc}
النوع: ${idea.format}

${STYLE_GUIDE.brand}
الأسلوب: ${STYLE_GUIDE.tone}

المطلوب: اكتب محتوى ${idea.type === 'ebook' ? 'الكتاب (10 صفحات على الأقل)' : 'المنتج'} بالعربية الاحترافية.
- لا تستخدم JSON أو أكواد برمجية.
- اكتب نصاً عربياً طبيعياً واحترافياً.`;

  try {
    const content = await callModel('production', prompt);
    const cleanContent = String(content).trim();

    if (cleanContent.length < 100) {
      warn('production', `Content too short for ${idea.title}: ${cleanContent.length} chars`);
      return null;
    }

    // Save to file
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

    // Save to catalog
    const catalog = loadCatalog();
    catalog.push(product);
    saveCatalog(catalog);

    // Save to DB
    db.prepare(`
      INSERT INTO tasks(source, title, reward, fit_score, status, payload_json)
      VALUES ('production', ?, ?, 0.8, 'drafted', ?)
    `).run(idea.title, idea.price, JSON.stringify(product));

    productionCount++;
    info('production', `✅ Generated: ${idea.title} (${cleanContent.length} chars) → ${filename}`);

    // Record in episodic memory
    EpisodicMemory.record('product_created', 'production', null, idea.title, `Type: ${idea.type}, Size: ${cleanContent.length}`, 'success');

    return product;
  } catch (e) {
    warn('production', `Failed to generate ${idea.title}: ${e.message}`);
    return null;
  }
}

/** Start continuous production cycle */
export async function startContinuousProduction() {
  if (running) {
    info('production', '⚠️ Production already running');
    return;
  }

  running = true;
  info('production', '🚀 Starting continuous production engine...');

  while (running) {
    const idea = getNextIdea();
    if (!idea) {
      info('production', '📦 All product ideas exhausted. Monitoring for new ideas...');
      break;
    }

    const product = await generateProduct(idea);
    if (product) {
      // Check if we need to send approval sample (1 of 10)
      if (productionCount % 10 === 0) {
        await sendApprovalSample(product);
      }
    }

    // Brief pause between products
    await new Promise(r => setTimeout(r, 5000));
  }

  running = false;
  info('production', `⏹ Production stopped. Total generated: ${productionCount}`);
}

/** Send 1 product per 10 for leader approval */
async function sendApprovalSample(product) {
  const sampleMsg = [
    `📦 **عينة موافقة — منتج #${productionCount}**`,
    '',
    `📌 العنوان: ${product.title}`,
    `📝 الوصف: ${product.description}`,
    `💰 السعر: $${product.price}`,
    `📁 النوع: ${product.type} (${product.format})`,
    `📏 الحجم: ${product.contentLength} حرف`,
    '',
    `---`,
    `📄 أول 3 صفحات:`,
    `---`,
    ''
  ].join('\n');

  try {
    const content = fs.readFileSync(product.filepath, 'utf8');
    const preview = content.slice(0, 1500);
    await sendMessageDetailed(sampleMsg + preview, config.telegramChatId);
    info('production', `📬 Approval sample sent for: ${product.title}`);

    // Record approval request
    db.prepare(`
      INSERT INTO tasks(source, title, status, payload_json)
      VALUES ('approval', ?, 'pending_approval', ?)
    `).run(`موافقة: ${product.title}`, JSON.stringify({ productId: product.id, type: product.type }));
  } catch (e) {
    warn('production', `Failed to send approval sample: ${e.message}`);
  }
}

/** Get production stats */
export function getProductionStats() {
  const catalog = loadCatalog();
  const draft = catalog.filter(p => p.status === 'draft').length;
  const approved = catalog.filter(p => p.approvalStatus === 'approved').length;
  const pending = catalog.filter(p => p.approvalStatus === 'pending').length;
  const published = catalog.filter(p => p.status === 'published').length;

  return {
    total: catalog.length,
    draft,
    approved,
    pending,
    published,
    running,
    productionCount
  };
}

/** Stop production */
export function stopContinuousProduction() {
  running = false;
  info('production', '⏹ Stopping continuous production...');
}

export default { startContinuousProduction, stopContinuousProduction, getProductionStats };
