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
  // Go to console directly with domcontentloaded
  console.log('1. Going to console.aihubmix.com...');
  await page.goto('https://console.aihubmix.com', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(8000);
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/aihubmix-v5-console.png' });
  
  const body = await page.evaluate(() => document.body.innerText.slice(0, 5000));
  console.log('Body:', body.replace(/\n+/g, ' | ').slice(0, 3000));
  
  const allInputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input, textarea')].map(i => ({
      type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
      visible: i.offsetParent !== null, value: i.value
    }));
  });
  console.log('Inputs:', JSON.stringify(allInputs, null, 2));

  // Try clicking Sign up on the main page instead
  console.log('\n2. Trying main page Sign up...');
  await page.goto('https://aihubmix.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(5000);
  
  // Click Sign up button
  const signupBtn = await page.$('button:has-text("Sign up")');
  if (signupBtn) {
    console.log('Found Sign up button, clicking...');
    await signupBtn.click();
    await page.waitForTimeout(5000);
    console.log('After signup click URL:', page.url());
    await page.screenshot({ path: '/tmp/aihubmix-v5-signup.png' });
    
    // Check what appeared
    const body2 = await page.evaluate(() => document.body.innerText.slice(0, 5000));
    console.log('After signup body:', body2.replace(/\n+/g, ' | ').slice(0, 3000));
    
    const inputs2 = await page.evaluate(() => {
      return [...document.querySelectorAll('input, textarea')].map(i => ({
        type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
        visible: i.offsetParent !== null
      }));
    });
    console.log('After signup inputs:', JSON.stringify(inputs2, null, 2));
    
    const modals = await page.evaluate(() => {
      return [...document.querySelectorAll('[class*="modal"], [class*="dialog"], [role="dialog"], [class*="popup"], [class*="drawer"]')].filter(m => m.offsetParent !== null).map(m => ({
        text: (m.innerText || '').slice(0, 500),
        class: (m.className || '').toString().slice(0, 100)
      }));
    });
    console.log('Modals after signup:', JSON.stringify(modals, null, 2));
  }

} catch (e) {
  console.log('ERROR:', e.message.slice(0, 500));
} finally {
  await browser.close();
}
