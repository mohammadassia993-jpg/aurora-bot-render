import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage();

try {
  // Go to the API console / developer platform
  console.log('1. Going to Kimi API console...');
  await page.goto('https://platform.kimi.com/console', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  
  const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('Body:', body.replace(/\n+/g, ' | ').slice(0, 800));
  
  // Check for login/register form
  const inputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input')].map(i => ({
      type: i.type, name: i.name, placeholder: i.placeholder, visible: i.offsetParent !== null
    })).filter(i => i.visible);
  });
  console.log('Inputs:', JSON.stringify(inputs));
  
  const btns = await page.evaluate(() => {
    return [...document.querySelectorAll('button, a')].filter(e => {
      const t = (e.innerText || '').toLowerCase();
      return t.includes('sign') || t.includes('login') || t.includes('register') || t.includes('登录') || t.includes('注册');
    }).map(e => ({ text: (e.innerText || '').trim().slice(0, 40), href: e.href || '' }));
  });
  console.log('Buttons:', JSON.stringify(btns));
  
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 200));
} finally {
  await browser.close();
}
