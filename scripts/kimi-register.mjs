import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();

try {
  console.log('1. Going to Moonshot platform...');
  await page.goto('https://platform.moonshot.cn', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());
  
  const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('Body:', body.replace(/\n+/g, ' | ').slice(0, 600));
  
  // Check for signup/login buttons
  const links = await page.evaluate(() => {
    return [...document.querySelectorAll('a, button')].filter(e => {
      const t = (e.innerText || '').toLowerCase();
      return t.includes('sign') || t.includes('register') || t.includes('login') || t.includes('注册') || t.includes('登录');
    }).map(e => ({ text: (e.innerText || '').trim().slice(0, 40), href: e.href || '', tag: e.tagName }));
  });
  console.log('Links:', JSON.stringify(links));
  
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 200));
} finally {
  await browser.close();
}
