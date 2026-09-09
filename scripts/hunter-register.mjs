import { chromium } from 'playwright';
import tls from 'node:tls';

const EMAIL = 'Mohammadassia993@gmail.com';
const PASSWORD = 'SilentGiants#2026';

// Hunter.io uses magic links (no password) — enter email, get link via email
console.log('Trying Hunter.io signup...');

const browser = await chromium.launch({
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',
  args: ['--no-sandbox']
});
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto('https://hunter.io/sign-up', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  const url = page.url();
  const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('URL:', url);
  
  // Try to find and fill email
  const inputs = await page.$$('input[type="email"], input[name="email"], input[autocomplete="email"]');
  if (inputs.length > 0) {
    console.log('Found email input, filling...');
    await inputs[0].fill(EMAIL);
    await page.waitForTimeout(500);
    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      console.log('Found submit button, clicking...');
      await submitBtn.click();
      await page.waitForTimeout(5000);
      const newBody = await page.evaluate(() => document.body.innerText.slice(0, 2000));
      console.log('After submit:', newBody.slice(0, 500));
    }
  } else {
    console.log('No email input found. Body:', body.slice(0, 500));
  }
} catch (e) {
  console.log('Error:', e.message);
} finally {
  await browser.close();
}
