import { chromium } from 'playwright';
import fs from 'node:fs';

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';

// Product slugs from the creation
const products = [
  { slug: 'jckjlt', name: 'قاموس مصطلحات Web3' },
  { slug: 'kenlat', name: 'دورة أساسيات DePIN' },
  { slug: 'llunpk', name: 'حزمة كتابة محتوى Web3' },
  { slug: 'izcdtl', name: 'شرح العقد الذكي' },
  { slug: 'gtnthl', name: 'حزمة تقديم الوظائف Web3' },
  { slug: 'rgwzjh', name: 'تحليل الأمن والاقتصاد الرمزي' },
  { slug: 'dkckfm', name: 'حزمة 92 مهمة Web3' }
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
    console.log(`\nPublishing: ${p.name} (${p.slug})`);
    try {
      await page.goto(`https://gumroad.com/products/${p.slug}/edit`, { timeout: 20000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      
      // Look for Publish button
      const publishBtn = await page.$('button:has-text("Publish"), a:has-text("Publish")');
      if (publishBtn) {
        const btnText = await publishBtn.evaluate(b => b.innerText?.trim());
        console.log(`Found button: "${btnText}", clicking...`);
        await publishBtn.click();
        await page.waitForTimeout(3000);
        
        const afterBody = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
        console.log('After click:', afterBody.slice(0, 150));
      } else {
        // Maybe it's already a toggle or a different element
        const allBtns = await page.evaluate(() => Array.from(document.querySelectorAll('button, a')).filter(b => {
          const text = b.innerText?.toLowerCase() || '';
          return text.includes('publish') || text.includes('unpublish') || text.includes('save');
        }).map(b => ({ text: b.innerText?.trim(), tag: b.tagName })));
        console.log('Related buttons:', JSON.stringify(allBtns));
      }
    } catch (e) {
      console.log(`Error: ${e.message.slice(0, 100)}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Final check
  await page.goto('https://gumroad.com/products', { timeout: 20000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const body = await page.evaluate(() => document.body?.innerText || '');
  console.log('\n=== FINAL STATUS ===');
  // Extract status lines
  const lines = body.split('\n').filter(l => l.includes('Unpublished') || l.includes('Published') || l.includes('Draft'));
  lines.forEach(l => console.log(l.trim()));
  
  await browser.close();
}

main();
