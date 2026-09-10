import fs from 'node:fs';

const TOKEN = 'iGraY5xPBDRZo6tZztJKa5USTVUjRdvFkwvJd3o-psM';
const BASE = 'https://api.gumroad.com/v2';

const products = [
  { name: 'قاموس مصطلحات Web3 (عربي/إنجليزي)', price: 999, description: 'قاموس شامل لأكثر من 200 مصطلح في عالم Web3 والبلوكتشين بالعربي والإنجليزي.' },
  { name: 'دورة أساسيات DePIN - 5 محطات', price: 1499, description: 'دورة تعليمية متكاملة في أساسيات DePIN في 5 محطات عملية.' },
  { name: 'حزمة كتابة محتوى Web3 - 10 قوالب', price: 1299, description: '10 قوالب احترافية لكتابة محتوى Web3: منشورات تويتر، مقالات مدونة، تقارير تقنية.' },
  { name: 'شرح العقد الذكي للمبتدئين', price: 799, description: 'شرح مبسط ومفصل للعقود الذكية: كيف تعمل، كيف تكتبها، وأمثلة عملية.' },
  { name: 'حزمة تقديم الوظائف Web3', price: 1199, description: 'حزمة شاملة للتقديم على وظائف Web3: خطابات تغطية، سيرة ذاتية، استراتيجيات مقابلات.' },
  { name: 'تحليل الأمن والاقتصاد الرمزي', price: 1999, description: 'تحليل شامل لأمن البلوكتشين والاقتصاد الرمزي: ثغرات شائعة، هجمات، وحماية الأصول.' },
  { name: 'حزمة 92 مهمة Web3 شاملة', price: 2999, description: 'حزمة شاملة تضم 92 مهمة ومقال وتحليل وترجمة في مجال Web3 والبلوكتشين.' }
];

async function uploadAll() {
  console.log('=== UPLOADING TO GUMROAD ===');
  
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    try {
      const res = await fetch(`${BASE}/products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ product: { name: p.name, price: p.price, description: p.description } }),
        signal: AbortSignal.timeout(30000)
      });
      const data = await res.json();
      if (data.success) {
        console.log(`✅ [${i+1}/${products.length}] ${data.product?.name} → ${data.product?.short_url || data.product?.url}`);
      } else {
        console.log(`❌ [${i+1}] ${JSON.stringify(data).slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`❌ [${i+1}] Error: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  
  // Verify
  try {
    const res = await fetch(`${BASE}/products?access_token=${TOKEN}`);
    const data = await res.json();
    console.log(`\n📦 Total products: ${data.products?.length || 0}`);
    data.products?.forEach((p, i) => {
      console.log(`  ${i+1}. ${p.name} - $${p.price/100} - ${p.short_url || p.url}`);
    });
  } catch (e) { console.log('Verify error:', e.message); }
}

uploadAll();
