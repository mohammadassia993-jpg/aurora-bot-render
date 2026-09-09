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
  await page.waitForTimeout(3000);
  
  // Click Sign up button
  console.log('2. Clicking Sign up...');
  const signupBtns = await page.$$('button');
  for (const btn of signupBtns) {
    const text = await btn.innerText().catch(() => '');
    if (text.includes('Sign up')) {
      console.log('Found Sign up button, clicking...');
      await btn.click();
      break;
    }
  }
  
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/tmp/aihubmix-signup2.png' });
  
  // Check for modal/popup
  const body = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log('Body after click:', body.replace(/\n+/g, ' | ').slice(0, 1000));
  
  // Check for inputs
  const inputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input')].map(i => ({
      type: i.type, name: i.name, placeholder: i.placeholder, 
      visible: i.offsetParent !== null
    })).filter(i => i.visible);
  });
  console.log('Inputs:', JSON.stringify(inputs, null, 2));
  
  // Check for any modals
  const modals = await page.evaluate(() => {
    return [...document.querySelectorAll('[class*="modal"], [class*="dialog"], [role="dialog"], [class*="popup"]')].filter(m => m.offsetParent !== null).map(m => ({
      text: (m.innerText || '').slice(0, 500),
      visible: true
    }));
  });
  console.log('Modals:', JSON.stringify(modals));
  
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 300));
} finally {
  await browser.close();
}
