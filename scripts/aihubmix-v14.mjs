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
  // Go to main page first
  console.log('1. Going to main page...');
  await page.goto('https://console.aihubmix.com', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Check if we're already on dashboard
  const hasCreateKey = await page.locator('button:has-text("Create API key")').count();
  console.log('Already on dashboard:', hasCreateKey > 0);
  
  if (hasCreateKey > 0) {
    // We're on the dashboard! Try to create API key directly
    console.log('2. On dashboard! Clicking Create API key...');
    await page.locator('button:has-text("Create API key")').click();
    await page.waitForTimeout(5000);
    
    await page.screenshot({ path: '/tmp/clerk-v14-create.png', fullPage: true });
    
    // Check for dialog
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log('Body after create:', bodyText.replace(/\n+/g, ' | ').slice(0, 1000));
    
    // Look for input in modal
    const modalInputs = await page.evaluate(() => {
      return [...document.querySelectorAll('.ant-modal input, .ant-drawer input, [role="dialog"] input')].map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder, visible: i.offsetParent !== null
      }));
    });
    console.log('Modal inputs:', JSON.stringify(modalInputs));
    
    // Try to find any visible input
    const allInputs = await page.evaluate(() => {
      return [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null).map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder, id: i.id
      }));
    });
    console.log('All visible inputs:', JSON.stringify(allInputs));
    
    // Fill key name if there's an input
    for (const input of allInputs) {
      if (input.placeholder?.toLowerCase().includes('name') || input.placeholder?.toLowerCase().includes('key')) {
        const el = page.locator(`input[placeholder="${input.placeholder}"]`).first();
        await el.fill('aurora-bot-kimi');
        console.log('Filled key name');
        break;
      }
    }
    
    // Click confirm/OK button
    const confirmBtns = await page.evaluate(() => {
      return [...document.querySelectorAll('.ant-modal button, .ant-btn-primary, button')].filter(b => {
        const text = b.innerText.toLowerCase();
        return (text.includes('create') || text.includes('ok') || text.includes('confirm') || text.includes('submit')) && b.offsetParent !== null;
      }).map(b => ({ text: b.innerText.trim(), tag: b.tagName }));
    });
    console.log('Confirm buttons:', JSON.stringify(confirmBtns));
    
    // Click the first confirm button
    const okBtn = page.locator('.ant-modal .ant-btn-primary, button:has-text("Create"):not(:has-text("API key"))').first();
    if (await okBtn.count() > 0) {
      await okBtn.click();
      await page.waitForTimeout(5000);
      console.log('Clicked confirm');
    }
    
    await page.screenshot({ path: '/tmp/clerk-v14-key.png', fullPage: true });
    
    // Try to extract any API key from page
    const keyText = await page.evaluate(() => {
      const text = document.body.innerText;
      const matches = text.match(/sk-[a-zA-Z0-9_-]{10,}/g) || [];
      return matches;
    });
    console.log('API keys found:', keyText);
    
    // Also check for any copy-to-clipboard elements
    const copyElements = await page.evaluate(() => {
      return [...document.querySelectorAll('[data-clipboard-text], [data-copy]')].map(e => ({
        text: e.getAttribute('data-clipboard-text') || e.getAttribute('data-copy')
      }));
    });
    console.log('Copy elements:', JSON.stringify(copyElements));
    
  } else {
    console.log('Not on dashboard, trying sign-up...');
    // Click Sign up
    const signUpBtn = page.locator('button:has-text("Sign up")').first();
    if (await signUpBtn.count() > 0) {
      await signUpBtn.click();
      await page.waitForTimeout(8000);
      
      // Now look for Clerk form
      const inputs = await page.evaluate(() => {
        return [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null).map(i => ({
          type: i.type, name: i.name, id: i.id, placeholder: i.placeholder
        }));
      });
      console.log('Inputs after sign-up click:', JSON.stringify(inputs));
      await page.screenshot({ path: '/tmp/clerk-v14-signup.png', fullPage: true });
    }
  }
  
} catch (e) {
  console.error('ERROR:', e.message);
  await page.screenshot({ path: '/tmp/clerk-v14-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
