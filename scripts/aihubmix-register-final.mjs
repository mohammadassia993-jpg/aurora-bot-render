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
  
  // Use fill() with CSS selectors
  console.log('2. Filling email...');
  await page.fill('input[name="emailAddress"]', EMAIL);
  console.log('Email filled');
  
  console.log('3. Filling password...');
  await page.fill('input[name="password"]', PASSWORD);
  console.log('Password filled');
  
  await page.waitForTimeout(500);
  
  // Check the Terms checkbox
  console.log('4. Checking Terms...');
  const checkbox = page.locator('input[name="legalAccepted"]');
  const isChecked = await checkbox.isChecked();
  if (!isChecked) {
    await checkbox.click();
    console.log('Terms checked');
  } else {
    console.log('Terms already checked');
  }
  
  await page.waitForTimeout(500);
  
  // Take screenshot before submit
  await page.screenshot({ path: '/tmp/aihubmix-pre-submit.png', fullPage: true });
  
  // Verify values
  const emailVal = await page.inputValue('input[name="emailAddress"]');
  const passVal = await page.inputValue('input[name="password"]');
  console.log('Verify - Email:', emailVal, 'Pass length:', passVal.length);
  
  // Click Continue
  console.log('5. Clicking Continue...');
  await page.click('button:has-text("Continue")');
  
  // Wait for response
  await page.waitForTimeout(10000);
  console.log('After submit URL:', page.url());
  await page.screenshot({ path: '/tmp/aihubmix-after-submit-final.png' });
  
  const bodyAfter = await page.evaluate(() => document.body.innerText.slice(0, 5000));
  console.log('Body:', bodyAfter.replace(/\n+/g, ' | ').slice(0, 3000));
  
  // Check for verification code input or success
  const inputsAfter = await page.evaluate(() => {
    return [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null).map(i => ({
      type: i.type, name: i.name, placeholder: i.placeholder
    }));
  });
  console.log('Inputs after:', JSON.stringify(inputsAfter, null, 2));
  
  const errors = await page.evaluate(() => {
    return [...document.querySelectorAll('[class*="error"], [class*="alert"], [role="alert"], .toast, [class*="toast"]')].filter(e => e.offsetParent !== null).map(e => e.innerText.trim().slice(0, 300));
  });
  console.log('Errors/Alerts:', JSON.stringify(errors));

} catch (e) {
  console.log('ERROR:', e.message.slice(0, 500));
  await page.screenshot({ path: '/tmp/aihubmix-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
