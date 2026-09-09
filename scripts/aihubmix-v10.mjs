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
  console.log('=== AIHubMix v10 ===');
  
  console.log('1. Going to console.aihubmix.com...');
  await page.goto('https://console.aihubmix.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  
  console.log('2. Clicking Sign up...');
  await page.click('button:has-text("Sign up")');
  await page.waitForTimeout(8000);
  console.log('URL:', page.url());
  
  // Fill email
  console.log('3. Filling email...');
  await page.locator('#emailAddress-field').click();
  await page.locator('#emailAddress-field').pressSequentially(EMAIL, { delay: 30 });
  console.log('Email:', await page.locator('#emailAddress-field').inputValue());
  
  // Fill password
  console.log('4. Filling password...');
  await page.locator('#password-field').click();
  await page.locator('#password-field').pressSequentially(PASSWORD, { delay: 30 });
  
  // Check checkbox
  console.log('5. Checking terms...');
  try {
    await page.locator('#legalAccepted-field').click({ force: true, timeout: 3000 });
    console.log('Checkbox clicked');
  } catch (e) { console.log('Checkbox skip:', e.message.slice(0, 50)); }
  
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/aihubmix-v10-before.png', fullPage: true });
  
  // Submit: press Enter on password field
  console.log('6. Submitting via Enter...');
  await page.locator('#password-field').press('Enter');
  
  await page.waitForTimeout(15000);
  console.log('7. After URL:', page.url());
  await page.screenshot({ path: '/tmp/aihubmix-v10-after.png', fullPage: true });
  
  const afterText = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  console.log('Text:', afterText.replace(/\n+/g, ' | ').slice(0, 2500));
  
  // Check for errors
  const errors = await page.evaluate(() => {
    return [...document.querySelectorAll('[role="alert"], [class*="error"]')]
      .filter(e => e.offsetParent !== null && e.innerText.trim().length > 2)
      .map(e => e.innerText.trim().slice(0, 300));
  });
  if (errors.length) console.log('Errors:', JSON.stringify(errors));
  
  // Check if redirected to dashboard
  if (page.url().includes('console.aihubmix.com') && !page.url().includes('sign')) {
    console.log('\n🔑 DASHBOARD!');
    
    // Look for API keys button
    const createBtn = page.locator('button:has-text("Create API key")').first();
    if (await createBtn.count() > 0) {
      console.log('8. Creating API key...');
      await createBtn.click();
      await page.waitForTimeout(5000);
      await page.screenshot({ path: '/tmp/aihubmix-v10-key.png', fullPage: true });
      
      const keyText = await page.evaluate(() => document.body.innerText);
      const skMatch = keyText.match(/sk-[a-zA-Z0-9_-]{10,}/g);
      if (skMatch) {
        console.log('\n🔑🔑🔑 FOUND KEY:', skMatch[0]);
        fs.writeFileSync('/tmp/aihubmix-api-key.txt', skMatch[0]);
      } else {
        console.log('No key found. Looking for any key-like pattern...');
        const anyKey = keyText.match(/[a-f0-9]{32,}/g);
        console.log('Hex keys:', anyKey);
        console.log('Page excerpt:', keyText.slice(0, 2000));
      }
    }
  }
  
} catch (e) {
  console.log('ERROR:', e.message);
  await page.screenshot({ path: '/tmp/aihubmix-v10-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
