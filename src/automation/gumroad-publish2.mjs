import { chromium } from 'playwright';
import fs from 'node:fs';

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';

const products = [
  { slug: 'jckjlt', name: 'قاموس مصطلحات Web3', price: '9.99' },
  { slug: 'kenlat', name: 'دورة أساسيات DePIN', price: '14.99' },
  { slug: 'llunpk', name: 'حزمة كتابة محتوى Web3', price: '12.99' },
  { slug: 'izcdtl', name: 'شرح العقد الذكي', price: '7.99' },
  { slug: 'gtnthl', name: 'حزمة تقديم الوظائف Web3', price: '11.99' },
  { slug: 'rgwzjh', name: 'تحليل الأمن والاقتصاد الرمزي', price: '19.99' },
  { slug: 'dkckfm', name: 'حزمة 92 مهمة Web3', price: '29.99' }
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
  
  const auth = JSON.parse(fs.readFileSync('/root/silent-giants/auth/gumroad.json', 'utf8'));
  await ctx.addCookies(auth.cookies);
  
  for (const p of products) {
    console.log(`\n--- ${p.name} (${p.slug}) ---`);
    try {
      await page.goto(`https://gumroad.com/products/${p.slug}/edit`, { timeout: 20000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);
      
      // Dump the full page structure to find the publish mechanism
      const pageStructure = await page.evaluate(() => {
        // Find all interactive elements
        const elements = [];
        document.querySelectorAll('button, a, [role="button"], input[type="checkbox"], select').forEach(el => {
          const text = el.innerText?.trim() || el.value || '';
          const href = el.href || '';
          if (text.length > 0 && text.length < 100) {
            elements.push({
              tag: el.tagName,
              text: text.slice(0, 80),
              href: href.slice(0, 100),
              type: el.type || '',
              checked: el.checked,
              className: (el.className || '').slice(0, 50)
            });
          }
        });
        return elements;
      });
      
      console.log('Interactive elements:', JSON.stringify(pageStructure.slice(0, 15), null, 2));
      
      // Look for publish-related elements
      const publishElements = pageStructure.filter(e => 
        e.text.toLowerCase().includes('publish') || 
        e.text.toLowerCase().includes('save') ||
        e.text.toLowerCase().includes('preview')
      );
      console.log('Publish-related:', JSON.stringify(publishElements));
      
      // Try clicking "Save and continue" to move to the next step
      const saveBtn = await page.$('button:has-text("Save and continue")');
      if (saveBtn) {
        console.log('Clicking "Save and continue"...');
        await saveBtn.click();
        await page.waitForTimeout(3000);
        
        const afterUrl = page.url();
        const afterBody = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
        console.log('After save URL:', afterUrl);
        console.log('After save body:', afterBody.slice(0, 300));
        
        // Check if we're on the publish step
        if (afterBody.includes('Publish')) {
          const pubBtn = await page.$('button:has-text("Publish")');
          if (pubBtn) {
            console.log('Found Publish button! Clicking...');
            await pubBtn.click();
            await page.waitForTimeout(3000);
            const pubBody = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
            console.log('After publish:', pubBody.slice(0, 200));
          }
        }
      }
    } catch (e) {
      console.log(`Error: ${e.message.slice(0, 150)}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  
  await browser.close();
}

main();
