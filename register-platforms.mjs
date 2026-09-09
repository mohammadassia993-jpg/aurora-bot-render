import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const EMAIL = 'auroraalmada4@gmail.com';
const PASSWORD = 'SilentWeb32026!';

const browser = await chromium.launch({
  headless: false,
  executablePath: CHROME,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1280,800'
  ]
});

const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
  locale: 'en-US',
  timezoneId: 'UTC'
});

await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  window.chrome = { runtime: {} };
});

const results = {};

// ===== 1. GUMROAD =====
console.log('\n========== 1. GUMROAD ==========');
try {
  const page = await ctx.newPage();
  await page.goto('https://gumroad.com/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/reg-01-gumroad-step1.png', fullPage: false });
  
  const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('Page text:', body.replace(/\n+/g, ' | ').slice(0, 500));
  
  if (body.includes('Checking') || body.includes('Cloudflare') || body.includes('challenge')) {
    console.log('BLOCKED: Cloudflare challenge detected');
    await page.waitForTimeout(15000);
    await page.screenshot({ path: '/tmp/reg-01-gumroad-step2.png', fullPage: false });
    const body2 = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log('After wait:', body2.replace(/\n+/g, ' | ').slice(0, 500));
  }
  
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  if (await emailInput.count() > 0) {
    await emailInput.fill(EMAIL);
    console.log('✅ Filled email');
    
    const passInput = page.locator('input[type="password"], input[name="password"]').first();
    if (await passInput.count() > 0) {
      await passInput.fill(PASSWORD);
      console.log('✅ Filled password');
    }
    
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign up"), button:has-text("Create"), button:has-text("Continue")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      console.log('✅ Clicked submit');
      await page.waitForTimeout(10000);
      await page.screenshot({ path: '/tmp/reg-01-gumroad-step3.png', fullPage: false });
      console.log('After submit URL:', page.url());
    }
    results.gumroad = 'form_submitted';
  } else {
    console.log('❌ No signup form found');
    results.gumroad = 'no_form: ' + body.slice(0, 200);
  }
  await page.close();
} catch (e) {
  console.error('Gumroad error:', e.message.slice(0, 200));
  results.gumroad = 'error: ' + e.message.slice(0, 200);
}

// ===== 2. PAYHIP =====
console.log('\n========== 2. PAYHIP ==========');
try {
  const page = await ctx.newPage();
  await page.goto('https://payhip.com/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/reg-02-payhip-step1.png', fullPage: false });
  
  const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('Page text:', body.replace(/\n+/g, ' | ').slice(0, 500));
  
  if (body.includes('Checking') || body.includes('Cloudflare') || body.includes('challenge')) {
    console.log('BLOCKED: Cloudflare challenge');
    await page.waitForTimeout(15000);
    await page.screenshot({ path: '/tmp/reg-02-payhip-step2.png', fullPage: false });
  }
  
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  if (await emailInput.count() > 0) {
    await emailInput.fill(EMAIL);
    const passInput = page.locator('input[type="password"], input[name="password"]').first();
    if (await passInput.count() > 0) await passInput.fill(PASSWORD);
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign up"), button:has-text("Create"), button:has-text("Register")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(10000);
      await page.screenshot({ path: '/tmp/reg-02-payhip-step3.png', fullPage: false });
      console.log('After submit URL:', page.url());
    }
    results.payhip = 'form_submitted';
  } else {
    results.payhip = 'no_form: ' + body.slice(0, 200);
  }
  await page.close();
} catch (e) {
  console.error('Payhip error:', e.message.slice(0, 200));
  results.payhip = 'error: ' + e.message.slice(0, 200);
}

// ===== 3. SELLFY =====
console.log('\n========== 3. SELLFY ==========');
try {
  const page = await ctx.newPage();
  await page.goto('https://www.sellfy.com/signup/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/reg-03-sellfy-step1.png', fullPage: false });
  
  const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('Page text:', body.replace(/\n+/g, ' | ').slice(0, 500));
  
  const firstNameInput = page.locator('input[name="first_name"], input[placeholder*="first" i]').first();
  if (await firstNameInput.count() > 0) {
    await firstNameInput.fill('Silent Giants');
    console.log('✅ Filled first name');
  }
  
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  if (await emailInput.count() > 0) {
    await emailInput.fill(EMAIL);
    console.log('✅ Filled email');
  }
  
  const passInput = page.locator('input[type="password"], input[name="password"]').first();
  if (await passInput.count() > 0) {
    await passInput.fill(PASSWORD);
    console.log('✅ Filled password');
  }
  
  const submitBtn = page.locator('button[type="submit"], button:has-text("Sign up"), button:has-text("Create"), button:has-text("Start")').first();
  if (await submitBtn.count() > 0) {
    await submitBtn.click();
    console.log('✅ Clicked submit');
    await page.waitForTimeout(10000);
    await page.screenshot({ path: '/tmp/reg-03-sellfy-step2.png', fullPage: false });
    console.log('After submit URL:', page.url());
  }
  results.sellfy = 'attempted';
  await page.close();
} catch (e) {
  console.error('Sellfy error:', e.message.slice(0, 200));
  results.sellfy = 'error: ' + e.message.slice(0, 200);
}

// ===== 4. GETXAPI =====
console.log('\n========== 4. GETXAPI ==========');
try {
  const page = await ctx.newPage();
  await page.goto('https://www.getxapi.com/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/reg-04-getxapi-step1.png', fullPage: false });
  
  const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('Page text:', body.replace(/\n+/g, ' | ').slice(0, 500));
  
  const closeBtn = page.locator('button:has-text("Close"), [aria-label="Close"], .modal-close, button:has-text("×")').first();
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
    console.log('Closed popup');
    await page.waitForTimeout(2000);
  }
  
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  if (await emailInput.count() > 0) {
    await emailInput.fill(EMAIL);
    const passInput = page.locator('input[type="password"], input[name="password"]').first();
    if (await passInput.count() > 0) await passInput.fill(PASSWORD);
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign up"), button:has-text("Create")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(10000);
      await page.screenshot({ path: '/tmp/reg-04-getxapi-step2.png', fullPage: false });
    }
    results.getxapi = 'form_submitted';
  } else {
    results.getxapi = 'no_form: ' + body.slice(0, 200);
  }
  await page.close();
} catch (e) {
  console.error('GetXAPI error:', e.message.slice(0, 200));
  results.getxapi = 'error: ' + e.message.slice(0, 200);
}

// ===== 5. IMMUNEFI =====
console.log('\n========== 5. IMMUNEFI ==========');
try {
  const page = await ctx.newPage();
  await page.goto('https://bugs.immunefi.com/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/reg-05-immunefi-step1.png', fullPage: false });
  
  const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('Page text:', body.replace(/\n+/g, ' | ').slice(0, 500));
  
  const githubBtn = page.locator('a:has-text("GitHub"), button:has-text("GitHub"), a[href*="github"]').first();
  if (await githubBtn.count() > 0) {
    await githubBtn.click();
    console.log('✅ Clicked GitHub signup');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/reg-05-immunefi-step2.png', fullPage: false });
    console.log('GitHub auth URL:', page.url());
  }
  results.immunefi = 'attempted';
  await page.close();
} catch (e) {
  console.error('Immunefi error:', e.message.slice(0, 200));
  results.immunefi = 'error: ' + e.message.slice(0, 200);
}

console.log('\n========== SUMMARY ==========');
console.log(JSON.stringify(results, null, 2));

await browser.close();
