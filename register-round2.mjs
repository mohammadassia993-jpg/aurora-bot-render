import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const EMAIL = 'auroraalmada4@gmail.com';
const PASSWORD = 'SilentWeb32026!';

const browser = await chromium.launch({
  headless: false,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled', '--window-size=1280,800']
});

const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
  locale: 'en-US'
});

await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  window.chrome = { runtime: {} };
});

const results = {};

// ===== 1. PAYHIP (try different URLs) =====
console.log('\n========== 1. PAYHIP ==========');
try {
  const page = await ctx.newPage();
  // Try the main site first to find signup link
  await page.goto('https://payhip.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('Payhip main URL:', page.url());
  await page.screenshot({ path: '/tmp/reg-r2-payhip-1.png', fullPage: false });
  
  const body = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log('Body:', body.replace(/\n+/g, ' | ').slice(0, 500));
  
  // Look for signup/register link
  const signupLink = page.locator('a:has-text("Sign up"), a:has-text("Register"), a:has-text("Get started"), a[href*="signup"], a[href*="register"]').first();
  if (await signupLink.count() > 0) {
    const href = await signupLink.getAttribute('href');
    console.log('Found signup link:', href);
    await signupLink.click();
    await page.waitForTimeout(5000);
    console.log('After click URL:', page.url());
  } else {
    // Try direct URLs
    const urls = ['https://payhip.com/register', 'https://payhip.com/#register', 'https://www.payhip.com/register'];
    for (const url of urls) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000);
      console.log('Tried:', url, '->', page.url());
      if (!page.url().includes('404')) break;
    }
  }
  
  await page.screenshot({ path: '/tmp/reg-r2-payhip-2.png', fullPage: false });
  const body2 = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log('Payhip final:', body2.replace(/\n+/g, ' | ').slice(0, 500));
  
  // Try to fill form
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  if (await emailInput.count() > 0) {
    await emailInput.fill(EMAIL);
    const passInput = page.locator('input[type="password"], input[name="password"]').first();
    if (await passInput.count() > 0) await passInput.fill(PASSWORD);
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign up"), button:has-text("Create"), button:has-text("Register")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(10000);
      await page.screenshot({ path: '/tmp/reg-r2-payhip-3.png', fullPage: false });
      console.log('Payhip after submit:', page.url());
    }
    results.payhip = 'attempted';
  } else {
    results.payhip = 'no_form_found';
  }
  await page.close();
} catch (e) {
  console.error('Payhip error:', e.message.slice(0, 200));
  results.payhip = 'error: ' + e.message.slice(0, 200);
}

// ===== 2. GETXAPI (fill form properly) =====
console.log('\n========== 2. GETXAPI ==========');
try {
  const page = await ctx.newPage();
  await page.goto('https://www.getxapi.com/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('GetXAPI URL:', page.url());
  
  // Close any popup
  try {
    const closeBtn = page.locator('[aria-label="Close"], button:has-text("×"), .close-button, [class*="close"]').first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click({ timeout: 3000 });
      console.log('Closed popup');
      await page.waitForTimeout(2000);
    }
  } catch(e) {}
  
  await page.screenshot({ path: '/tmp/reg-r2-getxapi-1.png', fullPage: false });
  const body = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log('GetXAPI body:', body.replace(/\n+/g, ' | ').slice(0, 500));
  
  // Find and fill all inputs
  const inputs = await page.locator('input').all();
  console.log('Found', inputs.length, 'inputs');
  for (let i = 0; i < inputs.length; i++) {
    const type = await inputs[i].getAttribute('type');
    const name = await inputs[i].getAttribute('name');
    const placeholder = await inputs[i].getAttribute('placeholder');
    console.log(`Input ${i}: type=${type}, name=${name}, placeholder=${placeholder}`);
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
    const nameInput = page.locator('input[name="name"], input[name="username"], input[placeholder*="name" i]').first();
    if (await nameInput.count() > 0) {
      await nameInput.fill('Silent Giants');
      console.log('✅ Filled name');
    }
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign up"), button:has-text("Create"), button:has-text("Register")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      console.log('✅ Clicked submit');
      await page.waitForTimeout(10000);
      await page.screenshot({ path: '/tmp/reg-r2-getxapi-2.png', fullPage: false });
      console.log('GetXAPI after submit:', page.url());
    }
    results.getxapi = 'form_submitted';
  } else {
    results.getxapi = 'no_email_input';
  }
  await page.close();
} catch (e) {
  console.error('GetXAPI error:', e.message.slice(0, 200));
  results.getxapi = 'error: ' + e.message.slice(0, 200);
}

// ===== 3. IMMUNEFI (fill form) =====
console.log('\n========== 3. IMMUNEFI ==========');
try {
  const page = await ctx.newPage();
  await page.goto('https://bugs.immunefi.com/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('Immunefi URL:', page.url());
  await page.screenshot({ path: '/tmp/reg-r2-immunefi-1.png', fullPage: false });
  
  const body = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log('Immunefi body:', body.replace(/\n+/g, ' | ').slice(0, 500));
  
  // Fill username
  const usernameInput = page.locator('input[name="username"], input[placeholder*="username" i]').first();
  if (await usernameInput.count() > 0) {
    await usernameInput.fill('silentgiants');
    console.log('✅ Filled username');
  }
  
  // Fill email
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  if (await emailInput.count() > 0) {
    await emailInput.fill(EMAIL);
    console.log('✅ Filled email');
  }
  
  // Fill password
  const passInputs = await page.locator('input[type="password"]').all();
  console.log('Found', passInputs.length, 'password inputs');
  for (const input of passInputs) {
    await input.fill(PASSWORD);
  }
  if (passInputs.length > 0) console.log('✅ Filled passwords');
  
  // Click sign up
  const submitBtn = page.locator('button:has-text("Sign-up"), button:has-text("Sign up"), button[type="submit"]').first();
  if (await submitBtn.count() > 0) {
    await submitBtn.click();
    console.log('✅ Clicked sign-up');
    await page.waitForTimeout(10000);
    await page.screenshot({ path: '/tmp/reg-r2-immunefi-2.png', fullPage: false });
    console.log('Immunefi after submit:', page.url());
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
