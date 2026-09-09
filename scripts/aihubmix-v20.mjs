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
  console.log('3. Filling form...');
  await page.locator('#emailAddress-field').fill('auroraalmada4@gmail.com');
  await page.waitForTimeout(300);
  await page.locator('#password-field').fill('SilentWeb32026!');
  await page.waitForTimeout(300);
  
  const checkbox = page.locator('#legalAccepted-field');
  if (await checkbox.count() > 0 && !(await checkbox.isChecked())) {
    await checkbox.check({ force: true });
  }
  
  // Try to remove the Clerk overlay and access the dashboard
  console.log('4. Trying to remove Clerk overlay...');
  await page.evaluate(() => {
    // Remove Clerk modal/overlay elements
    const clerkElements = document.querySelectorAll('[class*="cl-"], [id*="clerk"], .cl-modal, .cl-modalBackdrop');
    clerkElements.forEach(el => {
      if (el.style) el.style.display = 'none';
      el.remove();
    });
    
    // Remove any modal backdrop
    const backdrops = document.querySelectorAll('.ant-modal-mask, .ant-modal-wrap, [role="dialog"]');
    backdrops.forEach(el => el.remove());
    
    // Remove overlay divs
    const overlays = document.querySelectorAll('[style*="z-index: 9999"], [style*="position: fixed"]');
    overlays.forEach(el => {
      if (el.innerText.includes('Sign up') || el.innerText.includes('Continue')) {
        el.remove();
      }
    });
  });
  
  await page.waitForTimeout(2000);
  
  // Now try to click Create API key
  console.log('5. Looking for Create API key button...');
  const createBtn = page.locator('button:has-text("Create API key")');
  if (await createBtn.count() > 0) {
    console.log('   Found Create API key button! Clicking...');
    await createBtn.click();
    await page.waitForTimeout(5000);
    
    console.log('6. After click URL:', page.url());
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 1000));
    
    // Check for dialog/modal inputs
    const inputs = await page.evaluate(() => {
      return [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null).map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder, id: i.id
      }));
    });
    console.log('Inputs:', JSON.stringify(inputs));
    
    // If there's a name input, fill it
    const nameInput = page.locator('.ant-modal input, .ant-drawer input, input[placeholder*="name" i]').first();
    if (await nameInput.count() > 0) {
      await nameInput.fill('aurora-bot-kimi');
      console.log('7. Filled key name');
      
      // Find and click confirm button
      const confirmBtn = page.locator('.ant-modal .ant-btn-primary').first();
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click();
        await page.waitForTimeout(5000);
        console.log('8. Clicked confirm');
      }
    }
    
    await page.screenshot({ path: '/tmp/clerk-v20-result.png', fullPage: true });
    
    // Extract API key
    const keys = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.match(/sk-[a-zA-Z0-9_-]{10,}/g) || [];
    });
    console.log('API Keys:', keys);
    
    // Also check for any key displayed
    const keyElements = await page.evaluate(() => {
      return [...document.querySelectorAll('[data-clipboard-text], [data-copy], code, pre')].map(e => ({
        text: e.innerText?.slice(0, 100),
        clipboard: e.getAttribute('data-clipboard-text')
      })).filter(e => e.text || e.clipboard);
    });
    console.log('Key elements:', JSON.stringify(keyElements));
    
  } else {
    console.log('   Create API key button not found');
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 300));
  }
  
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: '/tmp/clerk-v20-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
