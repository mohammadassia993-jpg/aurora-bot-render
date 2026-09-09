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
  // Try the main page and look for auth links
  console.log('1. Going to aihubmix.com...');
  await page.goto('https://aihubmix.com', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/aihubmix-v3-home.png' });

  // Find ALL clickable elements with auth-related text
  const allLinks = await page.evaluate(() => {
    return [...document.querySelectorAll('a, button, [role="button"], [onclick]')].filter(e => {
      const text = (e.innerText || e.textContent || '').toLowerCase();
      const href = (e.href || '').toLowerCase();
      return text.includes('sign') || text.includes('log') || text.includes('register') || 
             text.includes('start') || text.includes('get api') || text.includes('free') ||
             href.includes('sign') || href.includes('login') || href.includes('register');
    }).map(e => ({
      text: (e.innerText || e.textContent || '').trim().slice(0, 60),
      href: e.href || '',
      tag: e.tagName,
      class: (e.className || '').toString().slice(0, 60)
    }));
  });
  console.log('\nAuth-related elements:', JSON.stringify(allLinks, null, 2));
  
  // Try clicking "Get API Key" button
  console.log('\n2. Trying "Get API Key" link...');
  const getApiKeyLink = await page.$('text=Get API Key');
  if (getApiKeyLink) {
    await getApiKeyLink.click();
    await page.waitForTimeout(5000);
    console.log('After clicking "Get API Key":', page.url());
    await page.screenshot({ path: '/tmp/aihubmix-v3-getkey.png' });
    
    const body2 = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    console.log('Body:', body2.replace(/\n+/g, ' | ').slice(0, 2000));
    
    const inputs2 = await page.evaluate(() => {
      return [...document.querySelectorAll('input, textarea')].map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder,
        visible: i.offsetParent !== null
      }));
    });
    console.log('Inputs:', JSON.stringify(inputs2, null, 2));
  }
  
  // Also try direct login page
  console.log('\n3. Trying login page...');
  await page.goto('https://aihubmix.com/user/login', { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(5000);
  console.log('Login URL:', page.url());
  await page.screenshot({ path: '/tmp/aihubmix-v3-login.png' });
  
  const loginBody = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log('Login body:', loginBody.replace(/\n+/g, ' | ').slice(0, 2000));
  
  const loginInputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input, textarea')].map(i => ({
      type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
      visible: i.offsetParent !== null
    }));
  });
  console.log('Login inputs:', JSON.stringify(loginInputs, null, 2));
  
  const loginLinks = await page.evaluate(() => {
    return [...document.querySelectorAll('a')].filter(a => {
      const t = (a.innerText || '').toLowerCase();
      const h = (a.href || '').toLowerCase();
      return t.includes('register') || t.includes('sign') || t.includes('create') || t.includes('forgot');
    }).map(a => ({ text: a.innerText.trim().slice(0,50), href: a.href }));
  });
  console.log('Login links:', JSON.stringify(loginLinks, null, 2));

} catch (e) {
  console.log('ERROR:', e.message.slice(0, 500));
} finally {
  await browser.close();
}
