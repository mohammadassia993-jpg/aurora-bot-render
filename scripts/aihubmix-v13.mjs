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

try {
  console.log('1. Navigating to sign-up...');
  await page.goto('https://console.aihubmix.com/sign-up', { waitUntil: 'networkidle', timeout: 45000 });
  
  // Wait for Clerk form to render - try multiple selectors
  console.log('2. Waiting for Clerk form to render...');
  
  // Wait longer for the form
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(2000);
    const count = await page.locator('input').count();
    console.log(`   Attempt ${i+1}: ${count} inputs found`);
    if (count > 0) break;
  }
  
  // Take screenshot to see what's on page
  await page.screenshot({ path: '/tmp/clerk-v13-step1.png', fullPage: true });
  
  // Get all input elements
  const inputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input')].map(i => ({
      type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
      visible: i.offsetParent !== null, value: i.value
    }));
  });
  console.log('Inputs:', JSON.stringify(inputs, null, 2));
  
  // Get all buttons
  const buttons = await page.evaluate(() => {
    return [...document.querySelectorAll('button')].map(b => ({
      text: b.innerText.trim().slice(0, 50),
      type: b.type,
      visible: b.offsetParent !== null,
      disabled: b.disabled
    }));
  });
  console.log('Buttons:', JSON.stringify(buttons, null, 2));
  
  // Check for iframe (Clerk might render in iframe)
  const frames = page.frames();
  console.log('Frames:', frames.length);
  for (const frame of frames) {
    console.log('  Frame URL:', frame.url().slice(0, 100));
    const frameInputs = await frame.locator('input').count();
    console.log('  Frame inputs:', frameInputs);
  }
  
  // Try to find and fill inputs in any frame
  for (const frame of frames) {
    const emailField = frame.locator('input[name="emailAddress"], input[type="email"]').first();
    if (await emailField.count() > 0) {
      console.log('Found email in frame:', frame.url().slice(0, 80));
      await emailField.fill(EMAIL);
      
      const passField = frame.locator('input[name="password"], input[type="password"]').first();
      if (await passField.count() > 0) {
        await passField.fill(PASSWORD);
      }
      
      // Check checkbox
      const cb = frame.locator('input[type="checkbox"]').first();
      if (await cb.count() > 0 && !(await cb.isChecked())) {
        await cb.check({ force: true });
      }
      
      await page.screenshot({ path: '/tmp/clerk-v13-filled.png', fullPage: true });
      
      // Submit
      const submitBtn = frame.locator('button[type="submit"], button:has-text("Continue")').first();
      if (await submitBtn.count() > 0) {
        console.log('Found submit button, clicking...');
        await submitBtn.click({ force: true });
        await page.waitForTimeout(15000);
        console.log('After submit URL:', page.url());
        await page.screenshot({ path: '/tmp/clerk-v13-after.png', fullPage: true });
        
        const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
        console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 500));
      }
      break;
    }
  }
  
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: '/tmp/clerk-v13-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
