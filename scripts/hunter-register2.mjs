import { chromium } from 'playwright';

const EMAIL = 'Mohammadassia993@gmail.com';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',
  args: ['--no-sandbox']
});
const context = await browser.newContext();
const page = await context.newPage();

const urls = ['https://hunter.io/signup', 'https://hunter.io/register', 'https://hunter.io/users/sign_up', 'https://hunter.io/auth/signup'];
for (const u of urls) {
  try {
    await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2500);
    const url = page.url();
    const body = (await page.evaluate(() => document.body.innerText)).slice(0, 300);
    console.log('\nURL:', u, '→ final:', url);
    console.log('Body:', body.replace(/\n+/g, ' | ').slice(0, 250));
    const inputs = await page.$$('input');
    console.log('Inputs:', inputs.length);
  } catch (e) {
    console.log('\nURL:', u, '→ ERR:', e.message.slice(0, 100));
  }
}

await browser.close();
