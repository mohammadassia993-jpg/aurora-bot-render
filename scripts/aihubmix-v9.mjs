import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const EMAIL = 'auroraalmada4@gmail.com';
const PASSWORD = 'SilentWeb32026!';

const browser = await chromium.launch({ 
  headless: true, executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'] 
});
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 }, locale: 'en-US'
});
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

const page = await ctx.newPage();
try {
  console.log('=== AIHubMix Registration v9 ===');
  
  // Step 1: Go to console and click Sign up
  console.log('1. Going to console.aihubmix.com...');
  await page.goto('https://console.aihubmix.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Click "Sign up" button in the nav
  console.log('2. Clicking Sign up...');
  await page.click('button:has-text("Sign up")');
  await page.waitForTimeout(5000);
  
  console.log('URL after Sign up click:', page.url());
  await page.screenshot({ path: '/tmp/aihubmix-v9-signup.png', fullPage: true });
  
  // Check all frames for the Clerk form
  let authFrame = null;
  for (const frame of page.frames()) {
    const url = frame.url();
    if (url.includes('clerk') || url.includes('sign-up') || url.includes('sign_up')) {
      console.log('Found auth frame:', url.slice(0, 200));
      authFrame = frame;
    }
    const inputs = await frame.evaluate(() => {
      return [...document.querySelectorAll('input')].map(i => ({
        type: i.type, name: i.name, id: i.id, placeholder: i.placeholder, visible: i.offsetParent !== null
      }));
    }).catch(() => []);
    if (inputs.length > 0) {
      console.log('Frame inputs:', url.slice(0, 80), JSON.stringify(inputs));
    }
  }
  
  // If we're on sign-in page (redirected), look for "Sign up" link in the form
  if (page.url().includes('sign-in')) {
    console.log('\nRedirected to sign-in. Looking for Sign up link...');
    const signUpLink = page.locator('a:has-text("Sign up"), button:has-text("Sign up")').last();
    if (await signUpLink.count() > 0) {
      console.log('Found Sign up link at bottom of form');
      await signUpLink.click();
      await page.waitForTimeout(5000);
      console.log('After clicking Sign up link, URL:', page.url());
      await page.screenshot({ path: '/tmp/aihubmix-v9-signup2.png', fullPage: true });
    }
  }
  
  // Now try to fill the Clerk form in the current page
  console.log('\n3. Looking for Clerk form inputs...');
  
  // The auth form might be in the main page or a frame
  // Let's try both
  const targetPage = authFrame || page;
  
  // Try email field
  const emailField = targetPage.locator('input[name="identifier"], input[name="emailAddress"], input[type="email"], input#identifier-field').first();
  if (await emailField.count() > 0) {
    console.log('Found email field!');
    // Use click + type (more natural)
    await emailField.click();
    await emailField.fill('');
    await page.waitForTimeout(200);
    
    // Try native keyboard input
    await emailField.pressSequentially(EMAIL, { delay: 50 });
    await page.waitForTimeout(500);
    
    const val = await emailField.inputValue();
    console.log('Email value:', val);
    
    if (val !== EMAIL) {
      // Try with evaluate
      console.log('Fill failed, trying evaluate...');
      await targetPage.evaluate((email) => {
        const inp = document.querySelector('input[name="identifier"], input[name="emailAddress"], input[type="email"], input#identifier-field');
        if (inp) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(inp, email);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, EMAIL);
      await page.waitForTimeout(500);
      const val2 = await emailField.inputValue();
      console.log('Email after evaluate:', val2);
    }
  } else {
    console.log('No email field found!');
    // List all inputs on the page
    const allInputs = await page.evaluate(() => {
      return [...document.querySelectorAll('input, textarea')].map(i => ({
        type: i.type, name: i.name, id: i.id, placeholder: i.placeholder
      }));
    });
    console.log('All page inputs:', JSON.stringify(allInputs));
  }
  
  // Try password field
  const passField = targetPage.locator('input[type="password"], input#password-field').first();
  if (await passField.count() > 0) {
    console.log('Found password field!');
    await passField.click();
    await passField.fill('');
    await passField.pressSequentially(PASSWORD, { delay: 50 });
    const passVal = await passField.inputValue();
    console.log('Password length:', passVal.length);
  }
  
  // Look for checkbox/terms
  const checkbox = targetPage.locator('input[type="checkbox"]').first();
  if (await checkbox.count() > 0) {
    console.log('Found checkbox, clicking...');
    await checkbox.click();
  }
  
  // Screenshot before submit
  await page.screenshot({ path: '/tmp/aihubmix-v9-before-submit.png', fullPage: true });
  
  // Verify values
  const finalEmail = await emailField.inputValue().catch(() => 'N/A');
  const finalPass = await passField.inputValue().catch(() => 'N/A');
  console.log('\n4. Final values - Email:', finalEmail, 'Pass length:', finalPass.length);
  
  // Submit
  if (finalEmail.includes('@') && finalPass.length > 0) {
    console.log('\n5. Submitting...');
    const submitBtn = targetPage.locator('button[type="submit"], button:has-text("Continue")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      console.log('Clicked Continue/Submit');
    }
    
    await page.waitForTimeout(10000);
    console.log('After submit URL:', page.url());
    await page.screenshot({ path: '/tmp/aihubmix-v9-after-submit.png', fullPage: true });
    
    // Check for verification code page or dashboard
    const afterText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    console.log('After submit text:', afterText.replace(/\n+/g, ' | ').slice(0, 2000));
    
    // Check for errors
    const errors = await page.evaluate(() => {
      return [...document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"]')]
        .filter(e => e.offsetParent !== null)
        .map(e => e.innerText.trim().slice(0, 300));
    });
    console.log('Errors:', JSON.stringify(errors));
    
    // If we're on the dashboard, look for API keys
    if (page.url().includes('console.aihubmix.com') && !page.url().includes('sign')) {
      console.log('\n🔑 On dashboard! Looking for API keys...');
      
      // Look for create API key button
      const createBtn = page.locator('button:has-text("Create API key"), button:has-text("Create")').first();
      if (await createBtn.count() > 0) {
        console.log('Clicking Create API key...');
        await createBtn.click();
        await page.waitForTimeout(5000);
        await page.screenshot({ path: '/tmp/aihubmix-v9-create-key.png', fullPage: true });
        
        const dialogText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
        console.log('Dialog:', dialogText.replace(/\n+/g, ' | ').slice(0, 1500));
        
        // Search for API key
        const allText = await page.evaluate(() => document.body.innerText);
        const skMatch = allText.match(/sk-[a-zA-Z0-9_-]{10,}/g);
        if (skMatch) {
          console.log('\n🔑 FOUND API KEY:', skMatch[0]);
          fs.writeFileSync('/tmp/aihubmix-api-key.txt', skMatch[0]);
        }
      }
    }
  } else {
    console.log('\n❌ Cannot submit - values not filled');
  }
  
} catch (e) {
  console.log('ERROR:', e.message);
  await page.screenshot({ path: '/tmp/aihubmix-v9-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
