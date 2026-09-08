import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome'
});
const context = await browser.newContext({ storageState: '/root/silent-giants/auth/gumroad.json' });
const page = await context.newPage();
await page.goto('https://app.gumroad.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);
const url = page.url();
const body = await page.evaluate(() => document.body.innerText.slice(0, 1500));
console.log('URL:', url);
console.log('BODY:', body);
await browser.close();
