import { chromium } from 'playwright';
const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const EMAIL = 'auroraalmada4@gmail.com';
const PASSWORD = 'SilentWeb32026!';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox','--disable-dev-shm-usage','--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', viewport: {width:1280,height:800}, locale:'en-US' });
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
const page = await ctx.newPage();

try {
  console.log('1. Going to Gumroad signup...');
  await page.goto('https://gumroad.com/signup', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Click "Continue with email" 
  console.log('2. Clicking Continue with email...');
  await page.locator('button:has-text("Continue with email"), button:has-text("Continue")').first().click();
  await page.waitForTimeout(3000);
  
  // Now fill email
  console.log('3. Filling email...');
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
  await page.waitForTimeout(500);
  
  // Fill password
  console.log('4. Filling password...');
  const passInput = page.locator('input[type="password"], input[name="password"]').first();
  if (await passInput.count() > 0) {
    await passInput.fill(PASSWORD);
  }
  
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/gumroad-v2-filled.png', fullPage: true });
  
  // Click Create account button
  console.log('5. Clicking Create account...');
  const createBtn = page.locator('button:has-text("Create account"), button:has-text("Create")').first();
  if (await createBtn.count() > 0) {
    await createBtn.click();
    await page.waitForTimeout(15000);
  }
  
  console.log('6. After submit URL:', page.url());
  await page.screenshot({ path: '/tmp/gumroad-v2-result.png', fullPage: true });
  
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 500));
  
  // Check for API key
  const keys = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.match(/pk_[a-zA-Z0-9_-]{10,}/g) || [];
  });
  if (keys.length > 0) console.log('API Keys:', keys);
  
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await browser.close();
}
