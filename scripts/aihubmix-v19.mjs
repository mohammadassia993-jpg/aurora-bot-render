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

// Intercept ALL requests to find the sign_up API call
const interceptedRequests = [];
page.on('request', async (request) => {
  const url = request.url();
  if (url.includes('clerk') && request.method() === 'POST') {
    interceptedRequests.push({
      url: url.slice(0, 150),
      method: request.method(),
      headers: request.headers(),
      postData: request.postData()?.slice(0, 500)
    });
    console.log(`[INTERCEPTED POST] ${url.slice(0, 100)}`);
    if (request.postData()) {
      console.log(`  PostData: ${request.postData().slice(0, 300)}`);
    }
  }
});

page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('clerk') && !url.includes('.js') && !url.includes('.css') && !url.includes('svg') && !url.includes('img')) {
    try {
      const body = await response.text().catch(() => '');
      if (body.length > 10) {
        console.log(`[CLERK ${response.status()}] ${url.slice(0, 80)}`);
        console.log(`  Body: ${body.slice(0, 300)}`);
      }
    } catch {}
  }
});

try {
  console.log('1. Going to main page...');
  await page.goto('https://console.aihubmix.com', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Click Sign up
  console.log('2. Clicking Sign up...');
  await page.locator('button:has-text("Sign up")').click();
  await page.waitForTimeout(8000);
  
  // Fill the Clerk form
  console.log('3. Filling form...');
  await page.locator('#emailAddress-field').fill('auroraalmada4@gmail.com');
  await page.waitForTimeout(300);
  await page.locator('#password-field').fill('SilentWeb32026!');
  await page.waitForTimeout(300);
  
  const checkbox = page.locator('#legalAccepted-field');
  if (await checkbox.count() > 0 && !(await checkbox.isChecked())) {
    await checkbox.check({ force: true });
  }
  
  // Try to click Continue using page.locator().click with multiple retries
  console.log('4. Attempting to click Continue...');
  
  // Get the exact button text and try to match it
  const allButtons = await page.evaluate(() => {
    return [...document.querySelectorAll('button')].map((b, i) => ({
      index: i,
      text: b.innerText.trim(),
      type: b.type,
      className: b.className.slice(0, 100),
      visible: b.offsetParent !== null,
      rect: b.getBoundingClientRect()
    }));
  });
  
  const continueBtn = allButtons.find(b => b.text === 'Continue');
  if (continueBtn) {
    console.log(`   Continue button found at index ${continueBtn.index}:`);
    console.log(`   Position: x=${continueBtn.rect.x}, y=${continueBtn.rect.y}, w=${continueBtn.rect.width}, h=${continueBtn.rect.height}`);
    console.log(`   Class: ${continueBtn.className}`);
    
    // Click at the exact coordinates
    const x = continueBtn.rect.x + continueBtn.rect.width / 2;
    const y = continueBtn.rect.y + continueBtn.rect.height / 2;
    console.log(`   Clicking at (${x}, ${y})...`);
    await page.mouse.click(x, y);
    
    await page.waitForTimeout(10000);
    
    console.log('5. After click URL:', page.url());
    
    // Check if we got past the form
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
    console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 500));
    
    // Check for verification code
    if (bodyText.includes('verification') || bodyText.includes('code') || bodyText.includes('verify')) {
      console.log('\n✅ Might need email verification!');
    }
  }
  
  // Print intercepted requests
  console.log('\n=== Intercepted POST requests ===');
  for (const req of interceptedRequests) {
    console.log(`${req.method} ${req.url}`);
    console.log(`  Headers: ${JSON.stringify(req.headers).slice(0, 200)}`);
    if (req.postData) console.log(`  Data: ${req.postData}`);
  }
  
  await page.screenshot({ path: '/tmp/clerk-v19-result.png', fullPage: true });
  
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: '/tmp/clerk-v19-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
