import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'zh-CN'
});
const page = await ctx.newPage();

try {
  // Step 1: Go to the console which should trigger login
  console.log('1. Going to Kimi console...');
  await page.goto('https://platform.kimi.com/console', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/kimi-console.png' });
  
  // Check for any login forms or modals
  const allInputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input, textarea')].map(i => ({
      type: i.type, name: i.name, placeholder: i.placeholder, 
      id: i.id, visible: i.offsetParent !== null,
      rect: i.getBoundingClientRect()
    }));
  });
  console.log('All inputs:', JSON.stringify(allInputs.filter(i => i.visible), null, 2));
  
  // Check for any iframes (login might be in an iframe)
  const iframes = await page.evaluate(() => {
    return [...document.querySelectorAll('iframe')].map(f => ({
      src: f.src,
      width: f.width,
      height: f.height
    }));
  });
  console.log('Iframes:', JSON.stringify(iframes));
  
  // Check for login/register buttons or links
  const links = await page.evaluate(() => {
    return [...document.querySelectorAll('a, button, div[role="button"]')].filter(e => {
      const t = (e.innerText || '').toLowerCase();
      return t.includes('登录') || t.includes('注册') || t.includes('login') || t.includes('sign');
    }).map(e => ({
      text: (e.innerText || '').trim().slice(0, 40),
      tag: e.tagName,
      href: e.href || ''
    }));
  });
  console.log('Login links:', JSON.stringify(links));
  
  // Try clicking the main login button
  const loginBtn = await page.$('text=登录') || await page.$('text=Login');
  if (loginBtn) {
    console.log('\n2. Found login button, clicking...');
    await loginBtn.click();
    await page.waitForTimeout(5000);
    console.log('After login click URL:', page.url());
    await page.screenshot({ path: '/tmp/kimi-login.png' });
    
    const inputs2 = await page.evaluate(() => {
      return [...document.querySelectorAll('input')].map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder, visible: i.offsetParent !== null
      })).filter(i => i.visible);
    });
    console.log('Login inputs:', JSON.stringify(inputs2));
  }
  
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 300));
} finally {
  await browser.close();
}
