import { chromium } from 'playwright';

const EMAIL = 'Mohammadassia993@gmail.com';
const PASSWORD = 'SilentGiants#2026';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',
  args: ['--no-sandbox']
});
const context = await browser.newContext();
const page = await context.newPage();

console.log('1. Opening Gumroad signup...');
await page.goto('https://gumroad.com/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);
console.log('URL now:', page.url());

// Try to find email input and fill
try {
  const emailInput = await page.$('input[type="email"], input[name="email"], input[autocomplete="email"]');
  if (emailInput) {
    console.log('Found email input');
    await emailInput.fill(EMAIL);
  }
} catch (e) { console.log('No email input found:', e.message); }

await page.waitForTimeout(1000);

// Capture body to understand the form
const bodyMeta = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input')].map(i => ({ type: i.type, name: i.name, placeholder: i.placeholder }));
  const buttons = [...document.querySelectorAll('button, [role="button"], input[type="submit"]')].map(b => (b.innerText || b.value || b.type || '').trim()).slice(0, 10);
  return { inputs, buttons };
});
console.log('Form structure:', JSON.stringify(bodyMeta, null, 2));

await browser.close();
