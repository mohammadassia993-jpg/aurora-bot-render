import { chromium } from 'playwright';
import fs from 'node:fs';

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';

const products = [
  { name: 'قاموس مصطلحات Web3 (عربي/إنجليزي)', price: 9.99, desc: 'قاموس شامل لأكثر من 200 مصطلح في عالم Web3 والبلوكتشين بالعربي والإنجليزي. مناسب للمبتدئين والمحترفين.' },
  { name: 'دورة أساسيات DePIN - 5 محطات', price: 14.99, desc: 'دورة تعليمية متكاملة في أساسيات DePIN في 5 محطات عملية.' },
  { name: 'حزمة كتابة محتوى Web3 - 10 قوالب', price: 12.99, desc: '10 قوالب احترافية لكتابة محتوى Web3: منشورات تويتر، مقالات مدونة، تقارير تقنية.' },
  { name: 'شرح العقد الذكي للمبتدئين', price: 7.99, desc: 'شرح مبسط ومفصل للعقود الذكية: كيف تعمل، كيف تكتبها، وأمثلة عملية.' },
  { name: 'حزمة تقديم الوظائف Web3', price: 11.99, desc: 'حزمة شاملة للتقديم على وظائف Web3: خطابات تغطية، سيرة ذاتية، استراتيجيات مقابلات.' },
  { name: 'تحليل الأمن والاقتصاد الرمزي', price: 19.99, desc: 'تحليل شامل لأمن البلوكتشين والاقتصاد الرمزي: ثغرات شائعة، هجمات، وحماية الأصول.' },
  { name: 'حزمة 92 مهمة Web3 شاملة', price: 29.99, desc: 'حزمة شاملة تضم 92 مهمة ومقال وتحليل وترجمة في مجال Web3 والبلوكتشين.' }
];

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  
  // Load cookies
  const auth = JSON.parse(fs.readFileSync('/root/silent-giants/auth/gumroad.json', 'utf8'));
  await ctx.addCookies(auth.cookies);
  console.log('Cookies loaded');
  
  // Go to products page
  await page.goto('https://gumroad.com/products', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  const url = page.url();
  const body = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
  console.log('Products page:', url);
  console.log('Body:', body.slice(0, 200));
  
  if (url.includes('login')) {
    console.log('NOT LOGGED IN!');
    await browser.close();
    return;
  }
  
  // Try to create each product via the browser
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    console.log(`\n--- Creating product ${i+1}: ${p.name} ---`);
    
    try {
      // Navigate to new product page
      await page.goto('https://gumroad.com/products/new', { timeout: 20000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      
      const pageUrl = page.url();
      console.log('New product URL:', pageUrl);
      
      // Check if we're on the right page
      const pageBody = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
      console.log('Page body:', pageBody.slice(0, 200));
      
      // Fill product name
      const nameInput = await page.$('input[id*="name"], input[placeholder*="name"], input[aria-label*="name"]');
      if (nameInput) {
        await nameInput.fill(p.name);
        console.log('Filled name');
      } else {
        console.log('No name input found');
        // Try by type
        const textInputs = await page.$$('input[type="text"]');
        if (textInputs.length > 0) {
          await textInputs[0].fill(p.name);
          console.log('Filled name via first text input');
        }
      }
      
      // Fill price
      const priceInput = await page.$('input[id*="price"], input[placeholder*="price"], input[type="number"]');
      if (priceInput) {
        await priceInput.fill(String(p.price));
        console.log('Filled price');
      }
      
      // Fill description
      const descInput = await page.$('textarea, div[contenteditable="true"]');
      if (descInput) {
        await descInput.fill(p.desc);
        console.log('Filled description');
      }
      
      await page.waitForTimeout(1000);
      
      // Click Save/Publish
      const saveBtn = await page.$('button:has-text("Save"), button:has-text("Publish"), button[type="submit"]');
      if (saveBtn) {
        await saveBtn.click();
        console.log('Clicked save');
        await page.waitForTimeout(5000);
        
        const afterUrl = page.url();
        const afterBody = await page.evaluate(() => document.body?.innerText?.slice(0, 200) || '');
        console.log('After save:', afterUrl);
        console.log('Body:', afterBody.slice(0, 100));
      } else {
        console.log('No save button found');
        const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.innerText?.trim()));
        console.log('Available buttons:', buttons.slice(0, 10));
      }
    } catch (e) {
      console.log(`Error: ${e.message.slice(0, 200)}`);
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Final check - list all products
  await page.goto('https://gumroad.com/products', { timeout: 20000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const finalBody = await page.evaluate(() => document.body?.innerText || '');
  console.log('\n=== FINAL PRODUCTS PAGE ===');
  console.log(finalBody.slice(0, 1000));
  
  await browser.close();
}

main();
