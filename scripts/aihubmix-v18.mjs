import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';

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

try {
  console.log('1. Going to main page...');
  await page.goto('https://console.aihubmix.com', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Click Sign up
  console.log('2. Clicking Sign up...');
  await page.locator('button:has-text("Sign up")').click();
  await page.waitForTimeout(8000);
  
  // Fill the Clerk form
  console.log('3. Filling email...');
  await page.locator('#emailAddress-field').fill('auroraalmada4@gmail.com');
  await page.waitForTimeout(300);
  
  console.log('4. Filling password...');
  await page.locator('#password-field').fill('SilentWeb32026!');
  await page.waitForTimeout(300);
  
  // Check terms
  const checkbox = page.locator('#legalAccepted-field');
  if (await checkbox.count() > 0 && !(await checkbox.isChecked())) {
    await checkbox.check({ force: true });
    console.log('5. Terms checked');
  }
  
  // Method: Use keyboard navigation (Tab to button, then Enter)
  console.log('6. Submitting via keyboard navigation...');
  await page.locator('#password-field').press('Tab');
  await page.waitForTimeout(200);
  // Now focus should be on the Continue button or checkbox area
  // Press Tab again to get to Continue button
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  
  await page.waitForTimeout(15000);
  
  console.log('7. After submit URL:', page.url());
  
  // Check body
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 1000));
  
  // Check for any error messages
  const errors = await page.evaluate(() => {
    const errorEls = document.querySelectorAll('.cl-formFieldError, .cl-formFeedback, [data-error], .error, .alert');
    return [...errorEls].map(e => e.innerText.trim()).filter(t => t.length > 0);
  });
  console.log('Errors:', JSON.stringify(errors));
  
  // Check for verification code page
  const verCodeInput = page.locator('input[name="code"], input[placeholder*="code" i], input[placeholder*="verification" i]');
  if (await verCodeInput.count() > 0) {
    console.log('\n✅ VERIFICATION CODE PAGE! Need to check email.');
    console.log('Input:', await verCodeInput.getAttribute('placeholder'));
  }
  
  await page.screenshot({ path: '/tmp/clerk-v18-result.png', fullPage: true });
  
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: '/tmp/clerk-v18-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
