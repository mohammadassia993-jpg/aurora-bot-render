import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const EMAIL = 'auroraalmada4@gmail.com';
const PASSWORD = 'SilentWeb32026!';

const browser = await chromium.launch({ 
  headless: true, 
  executablePath: CHROME, 
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'] 
});

const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
  locale: 'en-US'
});

await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
});

const page = await ctx.newPage();

// Monitor all network traffic for Clerk API calls
const clerkCalls = [];
page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('clerk') || url.includes('aihubmix')) {
    try {
      const status = response.status();
      const body = await response.text().catch(() => '');
      clerkCalls.push({ url: url.slice(0, 120), status, body: body.slice(0, 300) });
    } catch {}
  }
});

try {
  console.log('1. Navigating to sign-up page...');
  await page.goto('https://console.aihubmix.com/sign-up', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  
  // Screenshot current state
  await page.screenshot({ path: '/tmp/clerk-step1.png', fullPage: true });
  
  // Look for Google OAuth button as alternative
  const googleBtn = page.locator('button:has-text("Google"), a:has-text("Google"), [data-provider="google"]').first();
  const githubBtn = page.locator('button:has-text("GitHub"), a:has-text("GitHub"), [data-provider="github"]').first();
  
  console.log('Google button count:', await googleBtn.count());
  console.log('GitHub button count:', await githubBtn.count());
  
  // Try to find the email input
  const emailInput = page.locator('input[name="emailAddress"], input[type="email"], #emailAddress-field').first();
  const passInput = page.locator('input[name="password"], input[type="password"], #password-field').first();
  
  console.log('Email input count:', await emailInput.count());
  console.log('Password input count:', await passInput.count());
  
  if (await emailInput.count() > 0) {
    console.log('2. Filling email...');
    await emailInput.click();
    await emailInput.fill(EMAIL);
    await page.waitForTimeout(500);
    
    console.log('3. Filling password...');
    if (await passInput.count() > 0) {
      await passInput.click();
      await passInput.fill(PASSWORD);
      await page.waitForTimeout(500);
    }
    
    // Check terms checkbox
    const checkbox = page.locator('input[type="checkbox"], #legalAccepted-field').first();
    if (await checkbox.count() > 0) {
      const isChecked = await checkbox.isChecked();
      if (!isChecked) {
        await checkbox.check({ force: true });
        console.log('4. Checked terms');
      }
    }
    
    await page.screenshot({ path: '/tmp/clerk-step2-filled.png', fullPage: true });
    
    // Try to submit using keyboard
    console.log('5. Submitting via Enter key on password field...');
    await passInput.press('Enter');
    await page.waitForTimeout(10000);
    
    console.log('After submit URL:', page.url());
    await page.screenshot({ path: '/tmp/clerk-step3-after.png', fullPage: true });
    
    // Check body text
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
    console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 500));
  }
  
  // Print Clerk API calls
  console.log('\n=== Clerk Network Calls ===');
  for (const call of clerkCalls.slice(-15)) {
    console.log(`[${call.status}] ${call.url}`);
    if (call.body.includes('sign_up') || call.body.includes('error') || call.body.includes('captcha')) {
      console.log('  Body:', call.body.slice(0, 200));
    }
  }
  
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: '/tmp/clerk-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
