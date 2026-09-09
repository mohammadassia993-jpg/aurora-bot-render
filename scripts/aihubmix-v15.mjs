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

// Track Clerk API responses
const clerkResponses = [];
page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('clerk') && !url.includes('.js') && !url.includes('.css')) {
    try {
      const status = response.status();
      const body = await response.text().catch(() => '');
      clerkResponses.push({ url: url.slice(0, 120), status, body: body.slice(0, 500) });
      if (status >= 400 || body.includes('error') || body.includes('captcha')) {
        console.log(`[CLERK ${status}] ${url.slice(0, 80)}`);
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
  
  // Fill email
  console.log('3. Filling email...');
  const emailInput = page.locator('#emailAddress-field');
  await emailInput.click();
  await emailInput.fill(EMAIL);
  await page.waitForTimeout(500);
  
  // Fill password
  console.log('4. Filling password...');
  const passInput = page.locator('#password-field');
  await passInput.click();
  await passInput.fill(PASSWORD);
  await page.waitForTimeout(500);
  
  // Check terms
  console.log('5. Checking terms...');
  const checkbox = page.locator('#legalAccepted-field');
  if (await checkbox.count() > 0) {
    const isChecked = await checkbox.isChecked();
    if (!isChecked) {
      await checkbox.check({ force: true });
      console.log('   Terms checked');
    }
  }
  
  await page.screenshot({ path: '/tmp/clerk-v15-filled.png', fullPage: true });
  
  // Find and click submit button
  console.log('6. Looking for submit button...');
  
  // Get all visible buttons
  const buttons = await page.evaluate(() => {
    return [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).map(b => ({
      text: b.innerText.trim().slice(0, 50),
      type: b.type,
      disabled: b.disabled,
      className: b.className.slice(0, 80)
    }));
  });
  console.log('Visible buttons:', JSON.stringify(buttons, null, 2));
  
  // Try clicking the submit/continue button using evaluate to bypass React event issues
  console.log('7. Submitting via evaluate click...');
  const submitted = await page.evaluate(() => {
    // Find the submit button
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) {
      // Try multiple click methods
      submitBtn.click();
      
      // Also dispatch events
      submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      submitBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      submitBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      
      return { found: true, text: submitBtn.innerText, hidden: submitBtn.getAttribute('aria-hidden') };
    }
    
    // Try finding any button with "Continue" text
    const continueBtn = [...document.querySelectorAll('button')].find(b => 
      b.innerText.toLowerCase().includes('continue') && b.offsetParent !== null
    );
    if (continueBtn) {
      continueBtn.click();
      return { found: true, text: continueBtn.innerText };
    }
    
    return { found: false };
  });
  console.log('Submit result:', JSON.stringify(submitted));
  
  await page.waitForTimeout(15000);
  
  console.log('8. After submit URL:', page.url());
  await page.screenshot({ path: '/tmp/clerk-v15-after.png', fullPage: true });
  
  // Check body
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 500));
  
  // Check for verification code input
  const verInputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null).map(i => ({
      type: i.type, name: i.name, placeholder: i.placeholder
    }));
  });
  console.log('Inputs after submit:', JSON.stringify(verInputs));
  
  // Print Clerk API responses
  console.log('\n=== Clerk API Responses ===');
  for (const r of clerkResponses.slice(-10)) {
    console.log(`[${r.status}] ${r.url}`);
    console.log(`  ${r.body.slice(0, 200)}`);
  }
  
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: '/tmp/clerk-v15-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
