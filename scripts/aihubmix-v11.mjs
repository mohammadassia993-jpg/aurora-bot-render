import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const EMAIL = 'auroraalmada4@gmail.com';
const PASSWORD = 'SilentWeb32026!';

const browser = await chromium.launch({ 
  headless: true, executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'] 
});
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 }, locale: 'en-US'
});
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

const page = await ctx.newPage();
try {
  console.log('=== AIHubMix v11 ===');
  
  // Go to console and click Sign up
  await page.goto('https://console.aihubmix.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.click('button:has-text("Sign up")');
  await page.waitForTimeout(8000);
  
  // Fill email
  console.log('1. Filling email...');
  await page.locator('#emailAddress-field').click();
  await page.locator('#emailAddress-field').pressSequentially(EMAIL, { delay: 30 });
  console.log('Email:', await page.locator('#emailAddress-field').inputValue());
  
  // Fill password
  console.log('2. Filling password...');
  await page.locator('#password-field').click();
  await page.locator('#password-field').pressSequentially(PASSWORD, { delay: 30 });
  
  // Check checkbox
  console.log('3. Checking terms...');
  try {
    await page.locator('#legalAccepted-field').click({ force: true, timeout: 3000 });
  } catch (e) {}
  
  await page.waitForTimeout(500);
  
  // Screenshot before
  await page.screenshot({ path: '/tmp/aihubmix-v11-before.png', fullPage: true });
  
  // Verify
  const email = await page.locator('#emailAddress-field').inputValue();
  const pass = await page.locator('#password-field').inputValue();
  const checked = await page.locator('#legalAccepted-field').isChecked();
  console.log('Email:', email, 'Pass:', pass.length, 'Checked:', checked);
  
  // Submit: Click Continue button with FORCE
  console.log('\n4. Submitting via force click...');
  
  // Strategy: Use evaluate to submit the form
  const submitted = await page.evaluate(() => {
    // Try to find and click the submit button
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.innerText.trim();
      const isVisible = btn.offsetParent !== null;
      const isSubmit = btn.type === 'submit' || text === 'Continue';
      if (isVisible && isSubmit) {
        console.log('Clicking button:', text, btn.type);
        btn.click();
        return { clicked: true, text, type: btn.type };
      }
    }
    // Try submitting the form directly
    const forms = document.querySelectorAll('form');
    if (forms.length > 0) {
      forms[0].submit();
      return { clicked: true, method: 'form.submit' };
    }
    return { clicked: false };
  });
  console.log('Submit result:', JSON.stringify(submitted));
  
  // Also try clicking via Playwright
  try {
    await page.locator('button[type="submit"]').nth(0).click({ force: true, timeout: 5000 });
    console.log('Also clicked submit button via force');
  } catch (e) {
    console.log('Force click failed:', e.message.slice(0, 100));
  }
  
  // Try Tab + Enter
  try {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    console.log('Pressed Tab+Enter');
  } catch (e) {}
  
  // Wait for response
  console.log('\n5. Waiting for response...');
  await page.waitForTimeout(15000);
  
  console.log('After URL:', page.url());
  await page.screenshot({ path: '/tmp/aihubmix-v11-after.png', fullPage: true });
  
  const afterText = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  console.log('After:', afterText.replace(/\n+/g, ' | ').slice(0, 2500));
  
  // Check for verification code or errors
  const errors = await page.evaluate(() => {
    return [...document.querySelectorAll('[role="alert"], [class*="error"]')]
      .filter(e => e.offsetParent !== null && e.innerText.trim().length > 2)
      .map(e => e.innerText.trim().slice(0, 300));
  });
  if (errors.length) console.log('Errors:', JSON.stringify(errors));
  
  // Check if on dashboard
  if (page.url().includes('console.aihubmix.com') && !page.url().includes('sign')) {
    console.log('\n🔑 ON DASHBOARD!');
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    console.log(bodyText.replace(/\n+/g, ' | ').slice(0, 2000));
    
    // Try to create API key
    const createBtn = page.locator('button:has-text("Create API key")').first();
    if (await createBtn.count() > 0) {
      await createBtn.click({ force: true });
      await page.waitForTimeout(5000);
      await page.screenshot({ path: '/tmp/aihubmix-v11-key.png', fullPage: true });
      const keyText = await page.evaluate(() => document.body.innerText);
      const skMatch = keyText.match(/sk-[a-zA-Z0-9_-]{10,}/g);
      if (skMatch) {
        console.log('\n🔑🔑🔑 FOUND KEY:', skMatch[0]);
        fs.writeFileSync('/tmp/aihubmix-api-key.txt', skMatch[0]);
      }
    }
  }
  
} catch (e) {
  console.log('ERROR:', e.message);
  await page.screenshot({ path: '/tmp/aihubmix-v11-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
