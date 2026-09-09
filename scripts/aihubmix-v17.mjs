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
  
  // Click Continue button using multiple methods
  console.log('6. Clicking Continue...');
  
  // Method 1: Direct click on Continue button
  const continueBtn = page.locator('button.cl-formButtonPrimary').first();
  if (await continueBtn.count() > 0) {
    console.log('   Found Continue button, clicking with force...');
    await continueBtn.click({ force: true });
  } else {
    // Method 2: Press Enter on password field
    console.log('   No Continue button found, pressing Enter...');
    await page.locator('#password-field').press('Enter');
  }
  
  // Wait and check
  await page.waitForTimeout(15000);
  
  console.log('7. After submit URL:', page.url());
  
  // Check body
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 800));
  
  // Check for verification email page or dashboard
  const currentUrl = page.url();
  if (currentUrl.includes('sign-up') || currentUrl.includes('verify')) {
    console.log('\n=== Still on sign-up/verify page ===');
    // Check for email verification code input
    const verInputs = await page.evaluate(() => {
      return [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null).map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder, id: i.id
      }));
    });
    console.log('Inputs:', JSON.stringify(verInputs));
  }
  
  // Try to find API key in any case
  const apiKeys = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.match(/sk-[a-zA-Z0-9_-]{10,}/g) || [];
  });
  if (apiKeys.length > 0) {
    console.log('\n🔑 API Keys found:', apiKeys);
  }
  
  await page.screenshot({ path: '/tmp/clerk-v17-result.png', fullPage: true });
  
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: '/tmp/clerk-v17-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
