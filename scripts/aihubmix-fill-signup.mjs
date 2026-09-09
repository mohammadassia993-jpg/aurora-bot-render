import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const EMAIL = 'auroraalmada4@gmail.com';
const PASSWORD = 'Silent@Web3#2026!';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 }
});
const page = await ctx.newPage();

try {
  console.log('1. Going to AIHubMix signup page...');
  await page.goto('https://console.aihubmix.com/sign-up', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(6000);
  console.log('URL:', page.url());
  
  // Fill email
  console.log('2. Filling email...');
  const emailInput = await page.$('#emailAddress-field');
  if (emailInput) {
    await emailInput.click();
    await emailInput.fill(EMAIL);
    console.log('Email filled');
  } else {
    console.log('Email input not found, looking for alternatives...');
    const altInput = await page.$('input[name="emailAddress"]');
    if (altInput) {
      await altInput.click();
      await altInput.fill(EMAIL);
      console.log('Email filled via alternative');
    }
  }
  
  // Fill password
  console.log('3. Filling password...');
  const passInput = await page.$('#password-field');
  if (passInput) {
    await passInput.click();
    await passInput.fill(PASSWORD);
    console.log('Password filled');
  }
  
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/aihubmix-filled.png' });
  
  // Check the Terms checkbox
  console.log('4. Checking Terms of Service...');
  const checkbox = await page.$('#legalAccepted-field');
  if (checkbox) {
    const isChecked = await checkbox.isChecked();
    if (!isChecked) {
      await checkbox.click();
      console.log('Terms checkbox checked');
    } else {
      console.log('Terms checkbox already checked');
    }
  }
  
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/aihubmix-filled2.png' });
  
  // Click Continue/Submit
  console.log('5. Clicking Continue...');
  const continueBtn = await page.$('button:has-text("Continue")');
  if (continueBtn) {
    await continueBtn.click();
    console.log('Continue clicked');
  } else {
    // Try submit button
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      console.log('Submit clicked');
    }
  }
  
  await page.waitForTimeout(8000);
  console.log('After submit URL:', page.url());
  await page.screenshot({ path: '/tmp/aihubmix-after-submit.png' });
  
  const bodyAfter = await page.evaluate(() => document.body.innerText.slice(0, 5000));
  console.log('Body after submit:', bodyAfter.replace(/\n+/g, ' | ').slice(0, 3000));
  
  const inputsAfter = await page.evaluate(() => {
    return [...document.querySelectorAll('input, textarea')].map(i => ({
      type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
      visible: i.offsetParent !== null
    }));
  });
  console.log('Inputs after submit:', JSON.stringify(inputsAfter, null, 2));

  // Check for error messages
  const errors = await page.evaluate(() => {
    return [...document.querySelectorAll('[class*="error"], [class*="alert"], [role="alert"]')].filter(e => e.offsetParent !== null).map(e => e.innerText.trim().slice(0, 200));
  });
  console.log('Errors:', JSON.stringify(errors));

} catch (e) {
  console.log('ERROR:', e.message.slice(0, 500));
} finally {
  await browser.close();
}
