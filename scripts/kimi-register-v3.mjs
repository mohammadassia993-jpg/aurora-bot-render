import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'zh-CN'
});
const page = await ctx.newPage();

try {
  // Go to main page first (loads faster)
  console.log('1. Going to Kimi platform...');
  await page.goto('https://platform.kimi.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(5000);
  
  // Click "开始构造" button which should lead to console/login
  console.log('2. Clicking 开始构造...');
  const startBtn = await page.$('button:has-text("开始构造")');
  if (startBtn) {
    await startBtn.click();
    await page.waitForTimeout(5000);
    console.log('URL after click:', page.url());
  } else {
    // Navigate directly to console
    await page.goto('https://platform.kimi.com/console', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(5000);
    console.log('Direct console URL:', page.url());
  }
  
  await page.screenshot({ path: '/tmp/kimi-v3-step1.png' });
  
  // Wait more for SPA to render
  await page.waitForTimeout(5000);
  
  // Check current state
  const body = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) || '');
  console.log('Body:', body.replace(/\n+/g, ' | ').slice(0, 500));
  
  // Look for login form
  const inputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input')].map(i => ({
      type: i.type, name: i.name, placeholder: i.placeholder, 
      visible: i.offsetParent !== null
    })).filter(i => i.visible);
  });
  console.log('Inputs:', JSON.stringify(inputs));
  
  // Try to find and click login
  const loginElements = await page.evaluate(() => {
    return [...document.querySelectorAll('*')].filter(e => {
      const t = (e.innerText || '').trim();
      return (t === '登录' || t === 'Login' || t === '注册' || t === 'Sign up') && e.offsetParent !== null;
    }).map(e => ({ text: e.innerText.trim(), tag: e.tagName, id: e.id, className: (e.className || '').slice(0, 50) }));
  });
  console.log('Login elements:', JSON.stringify(loginElements));
  
  // Check for any modals or overlays
  const modals = await page.evaluate(() => {
    return [...document.querySelectorAll('[class*="modal"], [class*="dialog"], [class*="overlay"], [role="dialog"]')].map(m => ({
      class: (m.className || '').slice(0, 50),
      visible: m.offsetParent !== null,
      text: (m.innerText || '').slice(0, 200)
    }));
  });
  console.log('Modals:', JSON.stringify(modals.filter(m => m.visible)));
  
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/kimi-v3-error.png' });
} finally {
  await browser.close();
}
