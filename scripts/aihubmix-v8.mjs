import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const EMAIL = 'auroraalmada4@gmail.com';
const PASSWORD = 'SilentWeb32026!';

const browser = await chromium.launch({ 
  headless: true, executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'] 
});
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 }, locale: 'en-US'
});
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

const page = await ctx.newPage();
try {
  console.log('=== AIHubMix Registration v8 ===');
  
  // Step 1: Go to main page
  console.log('1. Going to console.aihubmix.com...');
  await page.goto('https://console.aihubmix.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  
  await page.screenshot({ path: '/tmp/aihubmix-v8-main.png', fullPage: true });
  
  const pageText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log('Page text:', pageText.replace(/\n+/g, ' | ').slice(0, 2000));
  
  // Find all links and buttons
  const links = await page.evaluate(() => {
    return [...document.querySelectorAll('a, button')].map(el => ({
      tag: el.tagName, text: el.innerText.trim().slice(0, 100),
      href: el.href || '', cls: el.className.slice(0, 100)
    })).filter(e => e.text.length > 0).slice(0, 30);
  });
  console.log('Links/buttons:', JSON.stringify(links, null, 2));
  
  // Check for sign-up/login buttons
  const signupBtn = page.locator('a:has-text("Sign"), button:has-text("Sign"), a:has-text("Register"), a:has-text("Log")').first();
  if (await signupBtn.count() > 0) {
    const href = await signupBtn.getAttribute('href').catch(() => 'none');
    console.log('\nSignup button found, href:', href);
    await signupBtn.click();
    await page.waitForTimeout(8000);
    console.log('After click URL:', page.url());
    await page.screenshot({ path: '/tmp/aihubmix-v8-after-click.png', fullPage: true });
    
    const afterText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    console.log('After click text:', afterText.replace(/\n+/g, ' | ').slice(0, 2000));
  }
  
  // Check frames
  const allFrames = page.frames();
  console.log('\nFrames:', allFrames.length);
  for (const frame of allFrames) {
    const url = frame.url();
    console.log('  Frame URL:', url.slice(0, 150));
    if (url.includes('clerk') || url.includes('sign') || url.includes('auth')) {
      const inputs = await frame.evaluate(() => {
        return [...document.querySelectorAll('input')].map(i => ({
          type: i.type, name: i.name, id: i.id, placeholder: i.placeholder, visible: i.offsetParent !== null
        }));
      }).catch(() => []);
      console.log('  Auth frame inputs:', JSON.stringify(inputs));
    }
  }
  
  // Check for Clerk scripts
  const clerkInfo = await page.evaluate(() => {
    const scripts = [...document.querySelectorAll('script')].map(s => s.src || '').filter(s => s.includes('clerk'));
    const metas = [...document.querySelectorAll('meta')].filter(m => {
      const content = m.getAttribute('content') || '';
      return content.includes('clerk') || content.includes('pk_');
    }).map(m => ({ name: m.getAttribute('name'), content: m.getAttribute('content') }));
    return { scripts, metas };
  }).catch(() => ({}));
  console.log('\nClerk info:', JSON.stringify(clerkInfo, null, 2));
  
} catch (e) {
  console.log('ERROR:', e.message);
  await page.screenshot({ path: '/tmp/aihubmix-v8-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
