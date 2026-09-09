import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';

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

// Log all network requests to find the API
const apiCalls = [];
page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('aihubmix') && (url.includes('api') || url.includes('key') || url.includes('auth') || url.includes('sign'))) {
    const status = response.status();
    try {
      const body = await response.text();
      apiCalls.push({ url, status, body: body.slice(0, 500) });
    } catch {}
  }
});

try {
  console.log('=== AIHubMix API Key Creation ===');
  
  // Step 1: Go to the console
  console.log('1. Navigating to console.aihubmix.com...');
  await page.goto('https://console.aihubmix.com', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);
  
  console.log('URL:', page.url());
  
  // Check if we're on a sign-in page
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log('Body (first 2000):', bodyText.replace(/\n+/g, ' | ').slice(0, 2000));
  
  // Look for sign-in/sign-up options
  const links = await page.evaluate(() => {
    return [...document.querySelectorAll('a, button')].map(el => ({
      text: el.innerText.trim().slice(0, 50),
      href: el.href || '',
      tag: el.tagName
    })).filter(l => l.text.length > 0);
  });
  console.log('\nLinks/Buttons:', JSON.stringify(links.slice(0, 30), null, 2));

  // Check for Google/GitHub OAuth buttons
  const oauthBtns = await page.evaluate(() => {
    return [...document.querySelectorAll('button, a')].filter(el => {
      const text = (el.innerText + ' ' + el.className).toLowerCase();
      return text.includes('google') || text.includes('github') || text.includes('oauth') || text.includes('sign');
    }).map(el => ({
      text: el.innerText.trim().slice(0, 80),
      tag: el.tagName,
      href: el.href || '',
      class: el.className.toString().slice(0, 100)
    }));
  });
  console.log('\nOAuth/Sign-in buttons:', JSON.stringify(oauthBtns, null, 2));
  
  await page.screenshot({ path: '/tmp/aihubmix-console-home.png', fullPage: true });

  // Step 2: Check if there's a login page and try Google OAuth
  const hasSignIn = bodyText.includes('Sign in') || bodyText.includes('Log in');
  const hasSignUp = bodyText.includes('Sign up') || bodyText.includes('Register');
  
  console.log('\nHas Sign-in:', hasSignIn);
  console.log('Has Sign-up:', hasSignUp);
  
  if (hasSignUp) {
    console.log('\n2. Clicking Sign up...');
    const signUpBtn = page.locator('button:has-text("Sign up"), a:has-text("Sign up")').first();
    if (await signUpBtn.count() > 0) {
      await signUpBtn.click();
      await page.waitForTimeout(5000);
      console.log('After sign-up click URL:', page.url());
      await page.screenshot({ path: '/tmp/aihubmix-signup-page.png', fullPage: true });
      
      // Check for Google OAuth
      const googleBtn = page.locator('button:has-text("Google"), button:has-text("Continue with Google")').first();
      if (await googleBtn.count() > 0) {
        console.log('Found Google OAuth button!');
      }
      
      // Check for email input
      const emailInput = page.locator('input[name="emailAddress"], input[type="email"]').first();
      if (await emailInput.count() > 0) {
        console.log('Found email input, filling...');
        await emailInput.click();
        await page.keyboard.type('auroraalmada4@gmail.com', { delay: 30 });
        await page.waitForTimeout(300);
        
        const passInput = page.locator('input[name="password"]').first();
        if (await passInput.count() > 0) {
          await passInput.click();
          await page.keyboard.type('SilentWeb32026!', { delay: 30 });
        }
        
        await page.screenshot({ path: '/tmp/aihubmix-filled.png', fullPage: true });
        
        // Try to submit
        const continueBtn = page.locator('button:has-text("Continue"), button[type="submit"]').first();
        if (await continueBtn.count() > 0) {
          await continueBtn.click();
          await page.waitForTimeout(10000);
          console.log('After submit URL:', page.url());
          await page.screenshot({ path: '/tmp/aihubmix-after-signup.png', fullPage: true });
        }
      }
    }
  }

  // Step 3: If we're on the dashboard, try to create API key
  if (page.url().includes('console.aihubmix.com') && !page.url().includes('sign')) {
    console.log('\n3. On dashboard, looking for Create API key...');
    
    const createBtn = page.locator('button:has-text("Create API key"), button:has-text("Create")').first();
    if (await createBtn.count() > 0) {
      console.log('Found Create API key button, clicking...');
      await createBtn.click();
      await page.waitForTimeout(5000);
      
      console.log('After create URL:', page.url());
      await page.screenshot({ path: '/tmp/aihubmix-create-dialog.png', fullPage: true });
      
      // Check for a dialog/modal
      const dialogBody = await page.evaluate(() => document.body.innerText.slice(0, 3000));
      console.log('After create body:', dialogBody.replace(/\n+/g, ' | ').slice(0, 2000));
      
      // Look for input fields in the dialog
      const dialogInputs = await page.evaluate(() => {
        return [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null).map(i => ({
          type: i.type, name: i.name, placeholder: i.placeholder, value: i.value.slice(0, 50)
        }));
      });
      console.log('Dialog inputs:', JSON.stringify(dialogInputs, null, 2));
      
      // Try to fill a name and submit
      const nameInput = page.locator('input[placeholder*="name" i], input[placeholder*="key" i]').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill('aurora-bot');
        console.log('Filled key name');
      }
      
      // Look for submit/confirm button in dialog
      const confirmBtn = page.locator('.ant-modal button:has-text("Create"), .ant-modal button:has-text("OK"), button:has-text("Confirm")').first();
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click();
        console.log('Clicked confirm');
        await page.waitForTimeout(5000);
      }
      
      await page.screenshot({ path: '/tmp/aihubmix-key-created.png', fullPage: true });
      
      // Extract API key from the page
      const keyText = await page.evaluate(() => {
        const body = document.body.innerText;
        // Look for patterns like sk-xxx or key-xxx or similar
        const matches = body.match(/[a-zA-Z0-9_-]{20,100}/g) || [];
        return matches.filter(m => m.length > 20 && m.length < 100);
      });
      console.log('\nPossible keys found:', keyText.slice(0, 10));
      
      // Also check clipboard
      const allText = await page.evaluate(() => document.body.innerText);
      const keyMatch = allText.match(/sk-[a-zA-Z0-9_-]{20,}/);
      if (keyMatch) {
        console.log('\n🔑 API Key found:', keyMatch[0]);
      }
    } else {
      console.log('No Create API key button found');
      
      // Maybe we need to sign in first
      const signInBtn = page.locator('button:has-text("Sign in"), a:has-text("Sign in"), button:has-text("Log in")').first();
      if (await signInBtn.count() > 0) {
        console.log('Found Sign in button, clicking...');
        await signInBtn.click();
        await page.waitForTimeout(5000);
        await page.screenshot({ path: '/tmp/aihubmix-signin.png', fullPage: true });
      }
    }
  }

  // Print API calls we intercepted
  console.log('\n=== API Calls ===');
  for (const call of apiCalls.slice(0, 20)) {
    console.log(`[${call.status}] ${call.url.slice(0, 100)}`);
    if (call.body.includes('key') || call.body.includes('token')) {
      console.log('  Body:', call.body.slice(0, 200));
    }
  }

} catch (e) {
  console.log('FATAL ERROR:', e.message);
  await page.screenshot({ path: '/tmp/aihubmix-key-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
