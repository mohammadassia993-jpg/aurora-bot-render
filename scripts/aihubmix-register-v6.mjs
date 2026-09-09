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

// Remove webdriver detection
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
});

const page = await ctx.newPage();

try {
  console.log('=== AIHubMix Registration v6 ===');
  
  // Step 1: Go directly to signup page
  console.log('1. Navigating to signup...');
  await page.goto('https://console.aihubmix.com/sign-up?entry_surface=header_register', { 
    waitUntil: 'networkidle', 
    timeout: 30000 
  });
  await page.waitForTimeout(5000);
  
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/aihubmix-v6-step1.png', fullPage: true });
  
  // Step 2: Inspect the DOM for iframes or special form elements
  const formInfo = await page.evaluate(() => {
    const iframes = [...document.querySelectorAll('iframe')];
    const inputs = [...document.querySelectorAll('input')];
    const shadowHosts = [...document.querySelectorAll('*')].filter(el => el.shadowRoot);
    return {
      iframes: iframes.map(f => ({ src: f.src, id: f.id, name: f.name })),
      inputs: inputs.map(i => ({
        type: i.type, name: i.name, id: i.id, 
        placeholder: i.placeholder, class: i.className.slice(0, 100),
        visible: i.offsetParent !== null,
        rect: i.getBoundingClientRect()
      })),
      shadowHosts: shadowHosts.length,
      bodyText: document.body.innerText.slice(0, 2000)
    };
  });
  
  console.log('Iframes:', JSON.stringify(formInfo.iframes, null, 2));
  console.log('Inputs:', JSON.stringify(formInfo.inputs, null, 2));
  console.log('Shadow hosts:', formInfo.shadowHosts);
  console.log('Body:', formInfo.bodyText.replace(/\n+/g, ' | ').slice(0, 1000));

  // Step 3: If there are iframes, the form might be inside one (Clerk/Auth0)
  if (formInfo.iframes.length > 0) {
    console.log('\n--- Found iframes, trying to access form inside them ---');
    for (const frame of page.frames()) {
      const url = frame.url();
      console.log('Frame URL:', url);
      const frameInputs = await frame.evaluate(() => {
        return [...document.querySelectorAll('input')].map(i => ({
          type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
          visible: i.offsetParent !== null
        }));
      }).catch(() => []);
      if (frameInputs.length > 0) {
        console.log('Inputs in frame:', JSON.stringify(frameInputs, null, 2));
      }
    }
  }

  // Step 4: Try filling email with multiple strategies
  const emailSelector = 'input[name="emailAddress"], input[type="email"], input[placeholder*="email" i], input[placeholder*="Email" i]';
  
  // Strategy 1: Direct fill
  console.log('\n--- Strategy 1: page.fill() ---');
  try {
    await page.fill(emailSelector, EMAIL, { timeout: 5000 });
    const val1 = await page.inputValue(emailSelector).catch(() => '');
    console.log('After fill:', val1);
  } catch (e) {
    console.log('Strategy 1 failed:', e.message.slice(0, 200));
  }

  // Strategy 2: Click then type with keyboard
  console.log('\n--- Strategy 2: Click + Keyboard ---');
  try {
    await page.click(emailSelector, { timeout: 5000 });
    await page.waitForTimeout(300);
    // Clear any existing value
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
    // Type character by character
    await page.keyboard.type(EMAIL, { delay: 50 });
    const val2 = await page.inputValue(emailSelector).catch(() => '');
    console.log('After keyboard type:', val2);
  } catch (e) {
    console.log('Strategy 2 failed:', e.message.slice(0, 200));
  }

  // Strategy 3: evaluate with native setter
  console.log('\n--- Strategy 3: evaluate + native setter ---');
  try {
    await page.evaluate((email) => {
      const input = document.querySelector('input[name="emailAddress"]') || 
                     document.querySelector('input[type="email"]');
      if (!input) throw new Error('Email input not found');
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, email);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // Also try React-specific events
      input.dispatchEvent(new Event('focus', { bubbles: true }));
      nativeSetter.call(input, email);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, EMAIL);
    const val3 = await page.inputValue(emailSelector).catch(() => '');
    console.log('After evaluate:', val3);
  } catch (e) {
    console.log('Strategy 3 failed:', e.message.slice(0, 200));
  }

  // Strategy 4: pressSequentially (Playwright built-in)
  console.log('\n--- Strategy 4: pressSequentially ---');
  try {
    await page.click(emailSelector, { timeout: 3000 });
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.locator(emailSelector).pressSequentially(EMAIL, { delay: 30 });
    const val4 = await page.inputValue(emailSelector).catch(() => '');
    console.log('After pressSequentially:', val4);
  } catch (e) {
    console.log('Strategy 4 failed:', e.message.slice(0, 200));
  }

  // Take screenshot to see current state
  await page.screenshot({ path: '/tmp/aihubmix-v6-after-email.png', fullPage: true });

  // Now try password
  console.log('\n--- Filling password ---');
  try {
    await page.fill('input[name="password"]', PASSWORD, { timeout: 5000 });
    console.log('Password filled');
  } catch (e) {
    console.log('Password fill failed:', e.message.slice(0, 200));
    try {
      await page.click('input[name="password"]');
      await page.keyboard.type(PASSWORD, { delay: 30 });
      console.log('Password typed via keyboard');
    } catch (e2) {
      console.log('Password keyboard also failed:', e2.message.slice(0, 200));
    }
  }

  // Check Terms checkbox
  try {
    const checkbox = page.locator('input[name="legalAccepted"]');
    if (await checkbox.count() > 0) {
      const checked = await checkbox.isChecked().catch(() => false);
      if (!checked) {
        await checkbox.click({ timeout: 3000 });
        console.log('Terms checkbox clicked');
      }
    }
  } catch (e) {
    console.log('Terms checkbox:', e.message.slice(0, 200));
  }

  await page.waitForTimeout(500);
  
  // Verify final values
  const finalEmail = await page.inputValue(emailSelector).catch(() => 'NOT_FOUND');
  const finalPass = await page.inputValue('input[name="password"]').catch(() => 'NOT_FOUND');
  console.log('\n=== Final values ===');
  console.log('Email:', finalEmail);
  console.log('Password length:', finalPass.length);
  
  await page.screenshot({ path: '/tmp/aihubmix-v6-before-submit.png', fullPage: true });

  // Step 5: Click Continue and handle response
  if (finalEmail.includes('@')) {
    console.log('\n--- Submitting form ---');
    
    // Intercept network requests to see what happens
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('sign') || url.includes('register') || url.includes('auth') || url.includes('create')) {
        console.log(`RESPONSE [${response.status()}] ${url.slice(0, 200)}`);
        try {
          const body = await response.text();
          console.log('Response body:', body.slice(0, 500));
        } catch {}
      }
    });
    
    await page.click('button:has-text("Continue"), button[type="submit"]');
    
    // Wait for navigation or response
    await page.waitForTimeout(15000);
    
    console.log('\n=== After submit ===');
    console.log('URL:', page.url());
    await page.screenshot({ path: '/tmp/aihubmix-v6-after-submit.png', fullPage: true });
    
    const afterBody = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    console.log('Body:', afterBody.replace(/\n+/g, ' | ').slice(0, 2000));
    
    // Check for verification code input or error
    const afterInputs = await page.evaluate(() => {
      return [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null).map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder, value: i.value.slice(0, 50)
      }));
    });
    console.log('After-submit inputs:', JSON.stringify(afterInputs, null, 2));
    
    const errors = await page.evaluate(() => {
      return [...document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"], .toast, [class*="toast"], [class*="warning"]')]
        .filter(e => e.offsetParent !== null)
        .map(e => e.innerText.trim().slice(0, 300));
    });
    console.log('Errors:', JSON.stringify(errors));

    // Check if we need to verify email
    if (afterBody.includes('verification') || afterBody.includes('verify') || afterBody.includes('code') || afterBody.includes('الموقع')) {
      console.log('\n⚠️ Email verification required! Checking email...');
      
      // Save cookies for later use
      const cookies = await ctx.cookies();
      fs.writeFileSync('/tmp/aihubmix-cookies.json', JSON.stringify(cookies, null, 2));
      console.log('Cookies saved to /tmp/aihubmix-cookies.json');
    }
  } else {
    console.log('\n❌ Email not filled properly, cannot submit');
  }

} catch (e) {
  console.log('FATAL ERROR:', e.message);
  await page.screenshot({ path: '/tmp/aihubmix-v6-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
