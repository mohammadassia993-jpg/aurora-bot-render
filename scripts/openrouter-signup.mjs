import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage();

try {
  console.log('1. Going to OpenRouter signup...');
  await page.goto('https://openrouter.ai/auth/signup', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  
  const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('Body:', body.replace(/\n+/g, ' | ').slice(0, 600));
  
  const inputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input')].map(i => ({
      type: i.type, name: i.name, placeholder: i.placeholder, visible: i.offsetParent !== null
    })).filter(i => i.visible);
  });
  console.log('Inputs:', JSON.stringify(inputs));
  
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 200));
} finally {
  await browser.close();
}
