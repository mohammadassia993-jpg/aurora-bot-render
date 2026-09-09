import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const EMAIL = 'auroraalmada4@gmail.com';
const PASSWORD = 'SilentWeb32026!';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 }
});
const page = await ctx.newPage();

try {
  console.log('1. Going to signup...');
  await page.goto('https://console.aihubmix.com/sign-up', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(6000);
  
  // Click on email field first
  console.log('2. Clicking email field...');
  await page.click('input[name="emailAddress"]');
  await page.waitForTimeout(500);
  
  // Clear and type character by character
  console.log('3. Typing email...');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(EMAIL, { delay: 50 });
  await page.waitForTimeout(500);
  
  // Verify email was entered
  const emailVal = await page.inputValue('input[name="emailAddress"]');
  console.log('Email value after typing:', emailVal);
  
  // Click password field
  console.log('4. Clicking password field...');
  await page.click('input[name="password"]');
  await page.waitForTimeout(500);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(PASSWORD, { delay: 50 });
  await page.waitForTimeout(500);
  
  const passVal = await page.inputValue('input[name="password"]');
  console.log('Password length after typing:', passVal.length);
  
  // Check Terms checkbox
  console.log('5. Checking Terms...');
  const isChecked = await page.locator('input[name="legalAccepted"]').isChecked();
  if (!isChecked) {
    await page.click('input[name="legalAccepted"]');
    console.log('Terms checked');
  }
  
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/aihubmix-typed.png', fullPage: true });
  
  // Click Continue
  console.log('6. Clicking Continue...');
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(10000);
  
  console.log('After submit URL:', page.url());
  await page.screenshot({ path: '/tmp/aihubmix-typed-result.png' });
  
  const body = await page.evaluate(() => document.body.innerText.slice(0, 5000));
  console.log('Body:', body.replace(/\n+/g, ' | ').slice(0, 3000));
  
  const errors = await page.evaluate(() => {
    return [...document.querySelectorAll('[class*="error"], [class*="alert"], [role="alert"], .toast, [class*="toast"], [class*="notification"]')].filter(e => e.offsetParent !== null).map(e => e.innerText.trim().slice(0, 300));
  });
  console.log('Errors/Alerts:', JSON.stringify(errors));

} catch (e) {
  console.log('ERROR:', e.message.slice(0, 500));
  await page.screenshot({ path: '/tmp/aihubmix-typed-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
