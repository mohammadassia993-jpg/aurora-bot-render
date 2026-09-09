import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();

try {
  await page.goto('https://www.getxapi.com/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Fill email and password
  await page.fill('#email', 'Mohammadassia993@gmail.com');
  await page.fill('#password', 'SilentGiants#2026');
  await page.waitForTimeout(500);
  
  console.log('Form filled. Looking for submit button...');
  
  // Find all clickable elements
  const btns = await page.evaluate(() => {
    return [...document.querySelectorAll('button, input[type="submit"], a')].filter(b => {
      const t = (b.innerText || '').toLowerCase();
      return t.includes('start') || t.includes('sign') || t.includes('create') || t.includes('register') || t.includes('submit') || b.type === 'submit';
    }).map(b => ({ text: (b.innerText || '').trim().slice(0, 40), tag: b.tagName, type: b.type, visible: b.offsetParent !== null }));
  });
  console.log('Buttons:', JSON.stringify(btns));
  
  // Click the primary action button
  const startBtn = await page.$('button:has-text("Start"), button:has-text("Sign up"), button[type="submit"]');
  if (startBtn) {
    console.log('Clicking button...');
    
    // Listen for navigation
    const navPromise = page.waitForNavigation({ timeout: 15000 }).catch(() => null);
    await startBtn.click();
    await navPromise;
    
    await page.waitForTimeout(5000);
    console.log('Final URL:', page.url());
    const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log('Body:', body.replace(/\n+/g, ' | ').slice(0, 800));
    
    // Check for API key in the page
    const hasApiKey = body.includes('api_key') || body.includes('API Key') || body.includes('token') || body.includes('Bearer');
    console.log('Has API key info:', hasApiKey);
    
    // Save session
    const cookies = await ctx.cookies();
    fs.writeFileSync('/root/silent-giants/auth/getxapi.json', JSON.stringify(cookies, null, 2));
    console.log('Session saved');
  }
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 200));
} finally {
  await browser.close();
}
