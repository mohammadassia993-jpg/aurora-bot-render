#!/usr/bin/env node
/**
 * multilang-content.js
 * Generate promotional posts in 5 languages for Twitter/LinkedIn/Telegram
 * Includes store link and product highlights
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUTPUT_DIR = path.join(ROOT, 'deliverables', 'publishing');
const STORE_URL = 'https://mohammadassia993-jpg.github.io/aurora-bot-render/';
const BOT_URL = 'https://t.me/Aurora_Almada_88_Bot';

const PRODUCTS = [
  { id: 1, name: { ar: 'قاموس Web3', en: 'Web3 Glossary', tr: 'Web3 Sözlüğü', fa: 'واژه‌نامه Web3', ur: 'Web3 لغت' }, price: 15, desc: { ar: '250+ مصطلح مترجم EN→AR', en: '250+ translated terms EN→AR', tr: '250+ çeviri terim EN→AR', fa: 'بیش از ۲۵۰ اصطلاح ترجمه شده', ur: '250+ ترجمہ شدے اصطلاحات' } },
  { id: 2, name: { ar: 'دورة أساسيات DePIN', en: 'DePIN Basics Course', tr: 'DePIN Temel Kursu', fa: 'دوره پایه DePIN', ur: 'DePIN بنیادی کورس' }, price: 25, desc: { ar: '5 محطات تعليمية شاملة', en: '5 comprehensive learning stations', tr: '5 kapsamlı öğrenme istasyonu', fa: '۵ ایستگاه آموزشی جامع', ur: '5 جامع تعلیمی اسٹیشنز' } },
  { id: 3, name: { ar: 'حزمة كتابة محتوى Web3', en: 'Web3 Content Writing Pack', tr: 'Web3 İçerik Yazma Paketi', fa: 'بسته نوشتن محتوای Web3', ur: 'Web3 مواد تحریر پیک' }, price: 35, desc: { ar: '10 قوالب احترافية جاهزة', en: '10 professional ready-made templates', tr: '10 profesyonel hazır şablon', fa: '۱۰ قالب حرفه‌ای آماده', ur: '10 پیشہ ورانہ تیار شدہ ٹیمپلیٹس' } },
  { id: 4, name: { ar: 'شرح العقد الذكي للمبتدئين', en: 'Smart Contract Guide for Beginners', tr: 'Akıllı Sözleşme Başlangıç Rehberi', fa: 'راهنمای قرارداد هوشمند', ur: 'سمارٹ کنٹریکٹ گائیڈ' }, price: 20, desc: { ar: 'شرح مبسط بالعربية مع أمثلة', en: 'Simplified Arabic explanation with examples', tr: 'Örneklerle basit Arapça açıklama', fa: 'توضیح ساده عربی با مثال', ur: 'مثالات کے ساتھ سادہ عربی وضاحت' } },
  { id: 5, name: { ar: 'حزمة تقديم وظائف Web3', en: 'Web3 Job Application Pack', tr: 'Web3 İş Başvuru Paketi', fa: 'بسته درخواست شغل Web3', ur: 'Web3 ملازمت درخواست پیک' }, price: 30, desc: { ar: '3 حزم تقديم احترافية', en: '3 professional submission packages', tr: '3 profesyonel başvuru paketi', fa: '۳ بسته درخواست حرفه‌ای', ur: '3 پیشہ ورانہ جمع کرانے کے پیک' } },
  { id: 6, name: { ar: 'تحليل الأمن والاقتصاد الرمزي', en: 'Security & Tokenomics Analysis', tr: 'Güvenlik ve Tokenomik Analizi', fa: 'تحلیل امنیت و اقتصاد توکن', ur: 'سیکیورٹی اور ٹوکنomics تجزیہ' }, price: 40, desc: { ar: 'تقييم شامل للمخاطر والفرص', en: 'Comprehensive risk and opportunity assessment', tr: 'Kapsamlı risk ve fırsat değerlendirmesi', fa: 'ارزیابی جامع ریسک و فرصت', ur: 'جامع خطرے اور مواقع کی تشخیص' } }
];

const POST_TEMPLATES = {
  ar: {
    productShowcase: (p) => `🛒 {name} — {price}$\n\n{desc}\n\n💳 الدفع: USDT/USDC\n📎 احصل عليه الآن: ${STORE_URL}\n\n#Web3 #DeFi #DePIN #عمالقة_الصمت #.web3_education`,
    generalAd: `🌟 عمالقة الصمت — خدمات محتوى Web3 بالعربية\n\n✅ مقالات تقنية احترافية\n✅ ترجمة وثائق (EN→AR)\n✅ تقارير بحثية عن المشاريع\n✅ إدارة محتوى شهرية\n\n📦 منتجاتنا الرقمية جاهزة: ${STORE_URL}\n💬 تواصل معنا: ${BOT_URL}\n\n#Web3 #Arabic #Content #DePIN`,
    storePromo: `🔥 تخفيضات على منتجاتنا الرقمية!\n\n1. قاموس Web3 — 15$\n2. دورة DePIN — 25$\n3. حزمة كتابة — 35$\n4. شرح عقد ذكي — 20$\n5. حزمة وظائف — 30$\n6. تحليل أمن — 40$\n\n💳 USDT/USDC فقط\n📎 ${STORE_URL}\n\n#Web3 #Crypto # SALE`
  },
  en: {
    productShowcase: (p) => `🛒 {name} — {price}$\n\n{desc}\n\n💳 Payment: USDT/USDC\n📎 Get it now: ${STORE_URL}\n\n#Web3 #DeFi #DePIN #SilentGiants #Web3Education`,
    generalAd: `🌟 Silent Giants — Arabic Web3 Content Services\n\n✅ Professional technical articles\n✅ EN→AR document translation\n✅ Research reports on projects\n✅ Monthly content management\n\n📦 Digital products ready: ${STORE_URL}\n💬 Contact us: ${BOT_URL}\n\n#Web3 #Arabic #Content #DePIN`,
    storePromo: `🔥 Sale on our digital products!\n\n1. Web3 Glossary — $15\n2. DePIN Basics Course — $25\n3. Content Writing Pack — $35\n4. Smart Contract Guide — $20\n5. Job Application Pack — $30\n6. Security Analysis — $40\n\n💳 USDT/USDC only\n📎 ${STORE_URL}\n\n#Web3 #Crypto #SALE`
  },
  tr: {
    productShowcase: (p) => `🛒 {name} — {price}$\n\n{desc}\n\n💳 Ödeme: USDT/USDC\n📎 Hemen alın: ${STORE_URL}\n\n#Web3 #DeFi #DePIN #SilentGiants #Web3Eğitim`,
    generalAd: `🌟 Silent Giants — Arapça Web3 İçerik Hizmetleri\n\n✅ Profesyonel teknik makaleler\n✅ EN→AR belge çevirisi\n✅ Proje araştırma raporları\n✅ Aylık içerik yönetimi\n\n📦 Dijital ürünler hazır: ${STORE_URL}\n💬 Bize ulaşın: ${BOT_URL}\n\n#Web3 #Arapça #İçerik #DePIN`,
    storePromo: `🔥 Dijital ürünlerimizde indirim!\n\n1. Web3 Sözlüğü — 15$\n2. DePIN Temel Kursu — 25$\n3. İçerik Yazma Paketi — 35$\n4. Akıllı Sözleşme Rehberi — 20$\n5. İş Başvuru Paketi — 30$\n6. Güvenlik Analizi — 40$\n\n💳 Yalnızca USDT/USDC\n📎 ${STORE_URL}\n\n#Web3 #Kripto #İNDİRİM`
  },
  fa: {
    productShowcase: (p) => `🛒 {name} — {price}$\n\n{desc}\n\n💳 پرداخت: USDT/USDC\n📎 همین الان بگیرید: ${STORE_URL}\n\n#Web3 #DeFi #DePIN #SilentGiants #آموزش_وب۳`,
    generalAd: `🌟 Silent Giants — خدمات محتوای Web3 به عربی\n\n✅ مقالات فنی حرفه‌ای\n✅ ترجمه اسناد EN→AR\n✅ گزارش‌های تحقیقاتی پروژه‌ها\n✅ مدیریت محتوای ماهانه\n\n📦 محصولات دیجیتال آماده: ${STORE_URL}\n💬 تماس با ما: ${BOT_URL}\n\n#Web3 #عربی #محتوا #DePIN`,
    storePromo: `🔥 تخفیف روی محصولات دیجیتال!\n\n1. واژه‌نامه Web3 — ۱۵$\n2. دوره پایه DePIN — ۲۵$\n3. بسته نوشتن محتوا — ۳۵$\n4. راهنمای قرارداد هوشمند — ۲۰$\n5. بسته درخواست شغل — ۳۰$\n6. تحلیل امنیت — ۴۰$\n\n💳 فقط USDT/USDC\n📎 ${STORE_URL}\n\n#Web3 #کریپتو #تخفیف`
  },
  ur: {
    productShowcase: (p) => `🛒 {name} — {price}$\n\n{desc}\n\n💳 ادائیگی: USDT/USDC\n📎 ابھی حاصل کریں: ${STORE_URL}\n\n#Web3 #DeFi #DePIN #SilentGiants #ویب۳_تعلیم`,
    generalAd: `🌟 Silent Giants — عربی ویب۳ مواد کی خدمات\n\n✅ پیشہ ورانہ تکنیکی مضامین\n✅ EN→AR دستاویزات کی ترجمہ\n✅ پروجیکٹس کی تحقیقاتی رپورٹیں\n✅ ماہانہ مواد کا انتظام\n\n📦 ڈیجیٹل مصنوعات تیار: ${STORE_URL}\n💬 ہم سے رابطہ: ${BOT_URL}\n\n#Web3 #عربی #مواد #DePIN`,
    storePromo: `🔥 ہماری ڈیجیٹل مصنوعات پر سیل!\n\n1. ویب۳ لغت — 15$\n2. DePIN بنیادی کورس — 25$\n3. مواد تحریر پیک — 35$\n4. سمارٹ کنٹریکٹ گائیڈ — 20$\n5. ملازمت درخواست پیک — 30$\n6. سیکیورٹی تجزیہ — 40$\n\n💳 صرف USDT/USDC\n📎 ${STORE_URL}\n\n#Web3 #کرپٹو #سیل`
  }
};

function generatePosts() {
  const allPosts = {};
  
  for (const [lang, templates] of Object.entries(POST_TEMPLATES)) {
    allPosts[lang] = [];
    
    // Product showcase posts
    for (const product of PRODUCTS) {
      const post = templates.productShowcase(product)
        .replace('{name}', product.name[lang] || product.name.en)
        .replace('{price}', product.price)
        .replace('{desc}', product.desc[lang] || product.desc.en);
      allPosts[lang].push({ type: 'product', productId: product.id, text: post });
    }
    
    // General ad
    allPosts[lang].push({ type: 'general', text: templates.generalAd });
    
    // Store promo
    allPosts[lang].push({ type: 'promo', text: templates.storePromo });
  }
  
  return allPosts;
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const posts = generatePosts();
  
  // Save as JSON
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'multilang-posts.json'),
    JSON.stringify(posts, null, 2)
  );
  
  // Save as readable markdown per language
  for (const [lang, langPosts] of Object.entries(posts)) {
    let md = `# منشورات ${lang.toUpperCase()} — عمالقة الصمت\n\n`;
    md += `تاريخ الإنشاء: ${new Date().toISOString()}\n\n`;
    md += `📎 رابط المتجر: ${STORE_URL}\n`;
    md += `💬 رابط البوت: ${BOT_URL}\n\n---\n\n`;
    
    for (const post of langPosts) {
      md += `## ${post.type === 'product' ? `منتج #${post.productId}` : post.type === 'general' ? 'إعلان عام' : 'عرض خاص'}\n\n`;
      md += `${post.text}\n\n---\n\n`;
    }
    
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `posts-${lang}.md`),
      md
    );
  }
  
  // Summary
  const summary = {
    languages: Object.keys(posts),
    totalPosts: Object.values(posts).reduce((sum, arr) => sum + arr.length, 0),
    postsPerLang: Object.fromEntries(Object.entries(posts).map(([k, v]) => [k, v.length])),
    storeUrl: STORE_URL,
    botUrl: BOT_URL,
    generatedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log(JSON.stringify(summary, null, 2));
}

main();
