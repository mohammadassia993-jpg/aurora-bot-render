import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',
  args: ['--no-sandbox']
});
const context = await browser.newContext();
const page = await context.newPage();

try {
  console.log('1. Going to Gumroad login...');
  await page.goto('https://gumroad.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log('URL:', page.url());

  // Check current form structure
  const formInfo = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')].map(i => ({ type: i.type, name: i.name, placeholder: i.placeholder, id: i.id }));
    const buttons = [...document.querySelectorAll('button, [role="button"]')].map(b => (b.innerText || '').trim().slice(0, 50)).filter(Boolean);
    return { inputs, buttons };
  });
  console.log('Form:', JSON.stringify(formInfo, null, 2));
  
} catch (e) {
  console.log('ERROR:', e.message);
} finally {
  await browser.close();
}
