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

const results = {};

// ========== 1. GUMROAD ==========
async function registerGumroad() {
  console.log('\n=== 1. GUMROAD ===');
  const page = await ctx.newPage();
  try {
    await page.goto('https://gumroad.com/signup', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    console.log('URL:', page.url());
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
    console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 500));
    
    await page.screenshot({ path: '/tmp/gumroad-1.png', fullPage: true });
    
    // Look for email input
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(EMAIL);
      console.log('Filled email');
      
      const passInput = page.locator('input[type="password"], input[name="password"]').first();
      if (await passInput.count() > 0) {
        await passInput.fill(PASSWORD);
        console.log('Filled password');
      }
      
      // Find submit button
      const submitBtn = page.locator('button[type="submit"], button:has-text("Sign up"), button:has-text("Create")').first();
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await page.waitForTimeout(10000);
        console.log('After submit URL:', page.url());
        await page.screenshot({ path: '/tmp/gumroad-2.png', fullPage: true });
      }
    } else {
      console.log('No email input found - checking for login option');
      const loginLink = page.locator('a:has-text("Log in"), a:has-text("Sign in")').first();
      if (await loginLink.count() > 0) {
        await loginLink.click();
        await page.waitForTimeout(5000);
        console.log('Login URL:', page.url());
      }
    }
    
    results.gumroad = 'attempted';
  } catch (e) {
    console.error('Gumroad error:', e.message);
    results.gumroad = 'error: ' + e.message.slice(0, 100);
  } finally {
    await page.close();
  }
}

// ========== 2. PAYHIP ==========
async function registerPayhip() {
  console.log('\n=== 2. PAYHIP ===');
  const page = await ctx.newPage();
  try {
    await page.goto('https://payhip.com/register', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    console.log('URL:', page.url());
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
    console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 500));
    
    await page.screenshot({ path: '/tmp/payhip-1.png', fullPage: true });
    
    // Fill registration form
    const nameInput = page.locator('input[name="name"], input[name="full_name"], input[placeholder*="name" i]').first();
    if (await nameInput.count() > 0) {
      await nameInput.fill('Silent Giants');
      console.log('Filled name');
    }
    
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(EMAIL);
      console.log('Filled email');
    }
    
    const passInput = page.locator('input[type="password"], input[name="password"]').first();
    if (await passInput.count() > 0) {
      await passInput.fill(PASSWORD);
      console.log('Filled password');
    }
    
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign up"), button:has-text("Register"), button:has-text("Create")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(10000);
      console.log('After submit URL:', page.url());
      await page.screenshot({ path: '/tmp/payhip-2.png', fullPage: true });
    }
    
    results.payhip = 'attempted';
  } catch (e) {
    console.error('Payhip error:', e.message);
    results.payhip = 'error: ' + e.message.slice(0, 100);
  } finally {
    await page.close();
  }
}

// ========== 3. SELLFY ==========
async function registerSellfy() {
  console.log('\n=== 3. SELLFY ===');
  const page = await ctx.newPage();
  try {
    await page.goto('https://sellfy.com/signup/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    console.log('URL:', page.url());
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
    console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 500));
    
    await page.screenshot({ path: '/tmp/sellfy-1.png', fullPage: true });
    
    // Fill registration form
    const inputs = await page.evaluate(() => {
      return [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null).map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder, id: i.id
      }));
    });
    console.log('Inputs:', JSON.stringify(inputs));
    
    // Try to fill email
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(EMAIL);
      console.log('Filled email');
    }
    
    // Try to fill password
    const passInput = page.locator('input[type="password"], input[name="password"]').first();
    if (await passInput.count() > 0) {
      await passInput.fill(PASSWORD);
      console.log('Filled password');
    }
    
    // Try to fill store name
    const storeInput = page.locator('input[name="store_name"], input[name="name"], input[placeholder*="store" i]').first();
    if (await storeInput.count() > 0) {
      await storeInput.fill('silent-giants');
      console.log('Filled store name');
    }
    
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign up"), button:has-text("Start"), button:has-text("Create")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(10000);
      console.log('After submit URL:', page.url());
      await page.screenshot({ path: '/tmp/sellfy-2.png', fullPage: true });
    }
    
    results.sellfy = 'attempted';
  } catch (e) {
    console.error('Sellfy error:', e.message);
    results.sellfy = 'error: ' + e.message.slice(0, 100);
  } finally {
    await page.close();
  }
}

// ========== 4. GETXAPI ==========
async function registerGetXAPI() {
  console.log('\n=== 4. GETXAPI ===');
  const page = await ctx.newPage();
  try {
    await page.goto('https://getxapi.com', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    console.log('URL:', page.url());
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
    console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 500));
    
    await page.screenshot({ path: '/tmp/getxapi-1.png', fullPage: true });
    
    // Look for sign up link
    const signupLink = page.locator('a:has-text("Sign up"), a:has-text("Register"), a:has-text("Get Started")').first();
    if (await signupLink.count() > 0) {
      await signupLink.click();
      await page.waitForTimeout(5000);
      console.log('Signup URL:', page.url());
      await page.screenshot({ path: '/tmp/getxapi-2.png', fullPage: true });
    }
    
    results.getxapi = 'attempted';
  } catch (e) {
    console.error('GetXAPI error:', e.message);
    results.getxapi = 'error: ' + e.message.slice(0, 100);
  } finally {
    await page.close();
  }
}

// ========== 5. IMMUNEFI ==========
async function registerImmunefi() {
  console.log('\n=== 5. IMMUNEFI ===');
  const page = await ctx.newPage();
  try {
    await page.goto('https://immunefi.com', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    console.log('URL:', page.url());
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
    console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 500));
    
    await page.screenshot({ path: '/tmp/immunefi-1.png', fullPage: true });
    
    // Look for sign up / login
    const signupLink = page.locator('a:has-text("Sign up"), a:has-text("Register"), a:has-text("Get Started"), a:has-text("Join")').first();
    if (await signupLink.count() > 0) {
      await signupLink.click();
      await page.waitForTimeout(5000);
      console.log('Signup URL:', page.url());
      await page.screenshot({ path: '/tmp/immunefi-2.png', fullPage: true });
    }
    
    results.immunefi = 'attempted';
  } catch (e) {
    console.error('Immunefi error:', e.message);
    results.immunefi = 'error: ' + e.message.slice(0, 100);
  } finally {
    await page.close();
  }
}

try {
  await registerGumroad();
  await registerPayhip();
  await registerSellfy();
  await registerGetXAPI();
  await registerImmunefi();
  
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(results, null, 2));
} catch (e) {
  console.error('FATAL:', e.message);
} finally {
  await browser.close();
}
