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
  const signupBtn = await page.$('button:has-text("Sign up")');
  if (signupBtn) {
    await signupBtn.click();
    await page.waitForTimeout(5000);
    console.log('URL after click:', page.url());
    await page.screenshot({ path: '/tmp/aihubmix-signup.png' });
    
    // Check for form
    const inputs = await page.evaluate(() => {
      return [...document.querySelectorAll('input')].map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder, 
        id: i.id, visible: i.offsetParent !== null
      })).filter(i => i.visible);
    });
    console.log('Inputs:', JSON.stringify(inputs, null, 2));
    
    // Check body
    const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log('Body:', body.replace(/\n+/g, ' | ').slice(0, 800));
  } else {
    console.log('No Sign up button found');
    // Try navigating to signup URL directly
    await page.goto('https://aihubmix.com/signup', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    console.log('Direct signup URL:', page.url());
    await page.screenshot({ path: '/tmp/aihubmix-signup.png' });
  }
  
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 300));
} finally {
  await browser.close();
}
