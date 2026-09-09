import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const EMAIL = 'auroraalmada4@gmail.com';
const PASSWORD = 'SilentWeb32026!';

const browser = await chromium.launch({ 
  headless: true, 
  executablePath: CHROME, 
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'] 
});
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
  locale: 'en-US'
});
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
});

const page = await ctx.newPage();

try {
  console.log('=== AIHubMix Registration v7 (Clerk-aware) ===');
  
  // Navigate to the Clerk sign-up URL directly
  console.log('1. Going to Clerk sign-up...');
  await page.goto('https://aihubmix.clerk.com/sign-up?redirect_url=https://console.aihubmix.com', { 
    waitUntil: 'networkidle', 
    timeout: 30000 
  });
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());
  
  // Check for iframes (Clerk often uses them)
  const frames = page.frames();
  console.log('Frames:', frames.length);
  for (const frame of frames) {
    console.log('  Frame:', frame.url().slice(0, 120));
  }
  
  // Try to find inputs in the main page and all frames
  let targetFrame = page;
  
  for (const frame of frames) {
    const inputs = await frame.evaluate(() => {
      return [...document.querySelectorAll('input')].map(i => ({
        type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
        visible: i.offsetParent !== null, tag: i.tagName
      }));
    }).catch(() => []);
    
    if (inputs.length > 0) {
      console.log(`\nInputs in frame [${frame.url().slice(0, 80)}]:`, JSON.stringify(inputs, null, 2));
      // Check if this frame has email-like inputs
      if (inputs.some(i => i.name.includes('email') || i.placeholder?.toLowerCase().includes('email'))) {
        targetFrame = frame;
        console.log('>>> Found email input in this frame!');
      }
    }
  }
  
  // Try to fill using the target frame
  console.log('\n2. Filling form in target frame...');
  
  // Strategy: Find email input by multiple selectors
  const emailSelectors = [
    'input[name="emailAddress"]',
    'input[type="email"]',
    'input[name="email"]',
    'input[placeholder*="email" i]',
    'input[id*="email" i]'
  ];
  
  let emailFilled = false;
  for (const sel of emailSelectors) {
    try {
      const el = targetFrame.locator(sel).first();
      if (await el.count() > 0) {
        console.log(`Found email input with selector: ${sel}`);
        await el.click({ timeout: 3000 });
        await el.fill(EMAIL, { timeout: 3000 });
        const val = await el.inputValue();
        console.log(`Email value after fill: "${val}"`);
        if (val === EMAIL) {
          emailFilled = true;
          break;
        }
        // If fill didn't work, try keyboard
        if (!val || val !== EMAIL) {
          await el.fill('');
          await targetFrame.keyboard.type(EMAIL, { delay: 30 });
          const val2 = await el.inputValue();
          console.log(`Email value after type: "${val2}"`);
          if (val2 === EMAIL) {
            emailFilled = true;
            break;
          }
        }
      }
    } catch (e) {
      console.log(`Selector ${sel} failed:`, e.message.slice(0, 100));
    }
  }
  
  if (!emailFilled) {
    // Last resort: try all inputs with evaluate
    console.log('\nTrying evaluate approach...');
    const result = await targetFrame.evaluate((email) => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        if (input.type === 'email' || input.name.includes('email') || input.name.includes('Email')) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(input, email);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
          return { success: true, name: input.name, value: input.value };
        }
      }
      return { success: false };
    }, EMAIL);
    console.log('Evaluate result:', JSON.stringify(result));
    emailFilled = result.success;
  }
  
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/aihubmix-v7-email.png', fullPage: true });
  
  // Fill password
  console.log('\n3. Filling password...');
  const passSelectors = [
    'input[name="password"]',
    'input[type="password"]'
  ];
  
  for (const sel of passSelectors) {
    try {
      const el = targetFrame.locator(sel).first();
      if (await el.count() > 0) {
        console.log(`Found password with: ${sel}`);
        await el.click({ timeout: 3000 });
        await el.fill(PASSWORD, { timeout: 3000 });
        const val = await el.inputValue();
        console.log(`Password value: length=${val.length}`);
        if (val.length > 0) break;
      }
    } catch (e) {
      console.log(`Pass selector ${sel} failed:`, e.message.slice(0, 100));
    }
  }
  
  // Check Terms checkbox
  console.log('\n4. Checking terms...');
  try {
    const checkbox = targetFrame.locator('input[type="checkbox"]').first();
    if (await checkbox.count() > 0) {
      const checked = await checkbox.isChecked().catch(() => false);
      if (!checked) {
        await checkbox.click({ timeout: 3000 });
        console.log('Checkbox clicked');
      } else {
        console.log('Checkbox already checked');
      }
    }
  } catch (e) {
    console.log('Checkbox:', e.message.slice(0, 100));
  }
  
  // Check if checkbox is a label/div (Clerk sometimes does this)
  try {
    const label = targetFrame.locator('label:has-text("agree"), label:has-text("I agree"), label:has-text("terms")').first();
    if (await label.count() > 0) {
      await label.click({ timeout: 2000 });
      console.log('Clicked terms label');
    }
  } catch {}
  
  await page.waitForTimeout(500);
  
  // Verify values before submit
  const verifyEmail = await targetFrame.locator('input[name="emailAddress"], input[type="email"]').first().inputValue().catch(() => 'NOT_FOUND');
  const verifyPass = await targetFrame.locator('input[type="password"]').first().inputValue().catch(() => 'NOT_FOUND');
  console.log(`\n5. Verification - Email: "${verifyEmail}", Password length: ${verifyPass.length}`);
  
  await page.screenshot({ path: '/tmp/aihubmix-v7-before-submit.png', fullPage: true });
  
  // Submit
  if (verifyEmail.includes('@') && verifyPass.length > 0) {
    console.log('\n6. Submitting...');
    
    // Intercept API calls
    const apiResponses = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('clerk') || url.includes('sign-up') || url.includes('register') || url.includes('create')) {
        try {
          const body = await response.text();
          apiResponses.push({ url: url.slice(0, 200), status: response.status(), body: body.slice(0, 500) });
        } catch {}
      }
    });
    
    const submitBtn = targetFrame.locator('button[type="submit"], button:has-text("Continue")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      console.log('Clicked submit');
    }
    
    await page.waitForTimeout(15000);
    console.log('\nAfter submit URL:', page.url());
    await page.screenshot({ path: '/tmp/aihubmix-v7-after-submit.png', fullPage: true });
    
    // Check body
    const afterBody = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    console.log('After body:', afterBody.replace(/\n+/g, ' | ').slice(0, 2000));
    
    // Check for errors
    const errors = await page.evaluate(() => {
      return [...document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"], [class*="toast"], [class*="danger"]')]
        .filter(e => e.offsetParent !== null)
        .map(e => e.innerText.trim().slice(0, 300));
    });
    console.log('Errors:', JSON.stringify(errors));
    
    // Check for verification code input
    const afterInputs = await page.evaluate(() => {
      return [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null).map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder
      }));
    });
    console.log('After-submit inputs:', JSON.stringify(afterInputs));
    
    // Print API responses
    console.log('\n=== API Responses ===');
    for (const r of apiResponses.slice(0, 10)) {
      console.log(`[${r.status}] ${r.url}`);
      if (r.body.length < 200) console.log(`  ${r.body}`);
    }
    
    // If we're on dashboard, look for API keys
    if (page.url().includes('console.aihubmix.com') && !page.url().includes('sign')) {
      console.log('\n🔑 On dashboard! Looking for API keys...');
      const keySection = await page.evaluate(() => {
        return document.body.innerText.slice(0, 3000);
      });
      console.log('Dashboard:', keySection.replace(/\n+/g, ' | ').slice(0, 1500));
      
      // Try to create API key
      const createBtn = page.locator('button:has-text("Create")').first();
      if (await createBtn.count() > 0) {
        console.log('\nClicking Create API key...');
        await createBtn.click();
        await page.waitForTimeout(5000);
        await page.screenshot({ path: '/tmp/aihubmix-v7-create-key.png', fullPage: true });
        
        const createBody = await page.evaluate(() => document.body.innerText.slice(0, 3000));
        console.log('Create dialog:', createBody.replace(/\n+/g, ' | ').slice(0, 1500));
        
        // Look for API key in page
        const possibleKeys = createBody.match(/sk-[a-zA-Z0-9_-]{10,}/g) || [];
        const possibleKeys2 = createBody.match(/[a-f0-9]{32,}/g) || [];
        console.log('Possible keys (sk-):', possibleKeys);
        console.log('Possible keys (hex):', possibleKeys2);
        
        // Try to close dialog and find key in the table
        const closeBtn = page.locator('button:has-text("Close"), button:has-text("Cancel"), .ant-modal-close').first();
        if (await closeBtn.count() > 0) {
          await closeBtn.click();
          await page.waitForTimeout(2000);
        }
        
        // Search for any key-like string in the entire page
        const allText = await page.evaluate(() => document.body.innerText);
        const skMatch = allText.match(/sk-[a-zA-Z0-9_-]{10,}/g);
        if (skMatch) {
          console.log('\n🔑🔑🔑 FOUND API KEY:', skMatch[0]);
          // Save to file
          fs.writeFileSync('/tmp/aihubmix-api-key.txt', skMatch[0]);
          console.log('Key saved to /tmp/aihubmix-api-key.txt');
        }
      }
    }
  } else {
    console.log('\n❌ Cannot submit - email or password not filled');
  }

} catch (e) {
  console.log('FATAL ERROR:', e.message);
  await page.screenshot({ path: '/tmp/aihubmix-v7-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
