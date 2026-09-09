import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
});
const page = await ctx.newPage();

try {
  console.log('1. Going to AIHubMix...');
  await page.goto('https://aihubmix.com', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  
  const body = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log('Body:', body.replace(/\n+/g, ' | ').slice(0, 1000));
  
  await page.screenshot({ path: '/tmp/aihubmix-home.png' });
  
  // Find signup/register/login buttons
  const links = await page.evaluate(() => {
    return [...document.querySelectorAll('a, button')].filter(e => {
      const t = (e.innerText || '').toLowerCase();
      const h = (e.href || '').toLowerCase();
      return t.includes('sign') || t.includes('register') || t.includes('login') || 
             t.includes('注册') || t.includes('登录') || t.includes('start') ||
             h.includes('sign') || h.includes('register') || h.includes('login');
    }).map(e => ({ text: (e.innerText || '').trim().slice(0, 40), href: e.href || '', tag: e.tagName }));
  });
  console.log('\nAuth links:', JSON.stringify(links, null, 2));
  
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 300));
} finally {
  await browser.close();
}
