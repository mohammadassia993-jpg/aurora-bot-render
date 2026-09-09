import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage();

// Try different signup URLs
const urls = [
  'https://snov.io/signup',
  'https://app.snov.io/register',
  'https://snov.io/auth/register',
  'https://app.snov.io/signup',
  'https://phantombuster.com/register'
];

for (const u of urls) {
  try {
    await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    const url = page.url();
    const has404 = await page.evaluate(() => document.body.innerText.includes('404') || document.body.innerText.includes('blocked'));
    const body = await page.evaluate(() => document.body.innerText.slice(0, 300));
    console.log(u, '->', url, has404 ? '(404/blocked)' : '(OK)');
    if (!has404) console.log('  Body:', body.replace(/\n+/g, ' | ').slice(0, 200));
  } catch (e) {
    console.log(u, '-> ERROR:', e.message.slice(0, 80));
  }
}

await browser.close();
