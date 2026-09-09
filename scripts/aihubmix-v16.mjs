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
  
  // Check current URL and body
  console.log('URL:', page.url());
  
  // Look for Create API key button
  const createBtn = page.locator('button:has-text("Create API key")');
  const createCount = await createBtn.count();
  console.log('Create API key button count:', createCount);
  
  if (createCount > 0) {
    console.log('2. Clicking Create API key...');
    await createBtn.click();
    await page.waitForTimeout(5000);
    
    await page.screenshot({ path: '/tmp/clerk-v16-dialog.png', fullPage: true });
    
    // Check for modal/dialog
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 1000));
    
    // Look for input in any modal
    const allInputs = await page.evaluate(() => {
      return [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null).map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder, id: i.id
      }));
    });
    console.log('Visible inputs:', JSON.stringify(allInputs));
    
    // Try to find name input for API key
    const nameInput = page.locator('.ant-modal input, .ant-drawer input, input[placeholder*="name" i]').first();
    if (await nameInput.count() > 0) {
      await nameInput.fill('aurora-bot-kimi');
      console.log('3. Filled key name');
    }
    
    // Look for confirm/create button in modal
    const confirmBtn = page.locator('.ant-modal .ant-btn-primary, .ant-drawer .ant-btn-primary').first();
    if (await confirmBtn.count() > 0) {
      console.log('4. Clicking confirm...');
      await confirmBtn.click();
      await page.waitForTimeout(5000);
    }
    
    await page.screenshot({ path: '/tmp/clerk-v16-result.png', fullPage: true });
    
    // Extract API key
    const keyText = await page.evaluate(() => {
      const text = document.body.innerText;
      const skMatches = text.match(/sk-[a-zA-Z0-9_-]{10,}/g) || [];
      return skMatches;
    });
    console.log('API keys found:', keyText);
    
    // Check body again
    const bodyText2 = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log('Body after:', bodyText2.replace(/\n+/g, ' | ').slice(0, 1000));
  }
  
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: '/tmp/clerk-v16-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
