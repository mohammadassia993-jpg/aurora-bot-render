import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 }
});
const page = await ctx.newPage();

try {
  console.log('1. Going to AIHubMix console...');
  await page.goto('https://console.aihubmix.com', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/aihubmix-v4-console.png' });
  
  const body = await page.evaluate(() => document.body.innerText.slice(0, 5000));
  console.log('Console body:', body.replace(/\n+/g, ' | ').slice(0, 3000));
  
  const allInputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input, textarea')].map(i => ({
      type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
      visible: i.offsetParent !== null
    }));
  });
  console.log('Inputs:', JSON.stringify(allInputs, null, 2));
  
  const allButtons = await page.evaluate(() => {
    return [...document.querySelectorAll('button, a, [role="button"]')].filter(e => e.offsetParent !== null).map(e => ({
      text: (e.innerText || '').trim().slice(0, 60),
      href: e.href || '',
      tag: e.tagName
    }));
  });
  console.log('Buttons:', JSON.stringify(allButtons, null, 2));
  
  // Check for iframes
  const iframes = await page.evaluate(() => {
    return [...document.querySelectorAll('iframe')].map(f => ({
      src: f.src, visible: f.offsetParent !== null
    }));
  });
  console.log('Iframes:', JSON.stringify(iframes, null, 2));

} catch (e) {
  console.log('ERROR:', e.message.slice(0, 500));
} finally {
  await browser.close();
}
