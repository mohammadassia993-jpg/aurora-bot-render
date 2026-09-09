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

// Intercept all network requests to see what happens
const requests = [];
page.on('request', req => {
  if (req.url().includes('clerk') || req.url().includes('sign-up') || req.url().includes('register') || req.url().includes('create')) {
    requests.push({ method: req.method(), url: req.url().slice(0, 200) });
  }
});
page.on('response', async resp => {
  if (resp.url().includes('clerk') || resp.url().includes('sign-up') || resp.url().includes('register') || resp.url().includes('create')) {
    try {
      const body = await resp.text();
      console.log(`[RESPONSE ${resp.status()}] ${resp.url().slice(0, 120)}`);
      if (body.length < 500) console.log(`  Body: ${body}`);
    } catch {}
  }
});

try {
  console.log('=== AIHubMix v12 (Sign In attempt + Network intercept) ===');
  
  // First, let's try to SIGN IN (account might already exist)
  console.log('\n1. Going to Sign In page...');
  await page.goto('https://console.aihubmix.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  
  // Click Sign In (not Sign Up)
  try {
    await page.click('button:has-text("Sign in")');
    await page.waitForTimeout(5000);
  } catch (e) {
    console.log('No sign in button, checking page...');
  }
  
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/aihubmix-v12-signin.png', fullPage: true });
  
  // Find email field
  console.log('\n2. Filling credentials for Sign In...');
  
  // Try to find the identifier field
  const emailField = page.locator('input#identifier-field, input[name="identifier"], input[type="text"][placeholder*="email" i]').first();
  if (await emailField.count() > 0) {
    await emailField.click();
    await emailField.fill('');
    await emailField.pressSequentially(EMAIL, { delay: 30 });
    console.log('Email:', await emailField.inputValue());
  } else {
    console.log('No email field found!');
    const allInputs = await page.evaluate(() => {
      return [...document.querySelectorAll('input')].map(i => ({type: i.type, name: i.name, id: i.id, placeholder: i.placeholder}));
    });
    console.log('All inputs:', JSON.stringify(allInputs));
  }
  
  // Password
  const passField = page.locator('input[type="password"], input#password-field').first();
  if (await passField.count() > 0) {
    await passField.click();
    await passField.fill('');
    await passField.pressSequentially(PASSWORD, { delay: 30 });
    console.log('Password length:', (await passField.inputValue()).length);
  }
  
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/aihubmix-v12-before-submit.png', fullPage: true });
  
  // Monitor network more closely
  console.log('\n3. Submitting and monitoring network...');
  
  // Use page.evaluate to click submit and intercept XHR
  await page.evaluate(() => {
    // Intercept fetch to log requests
    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      console.log('FETCH:', args[0], JSON.stringify(args[1]));
      const resp = await origFetch(...args);
      const clone = resp.clone();
      try {
        const text = await clone.text();
        console.log('FETCH RESPONSE:', resp.status, text.slice(0, 500));
      } catch {}
      return resp;
    };
    
    // Find and click the visible submit button
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.offsetParent !== null && (btn.innerText.trim() === 'Continue' || btn.type === 'submit')) {
        btn.click();
        break;
      }
    }
  });
  
  // Also try keyboard approach
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  
  console.log('\n4. Waiting for response...');
  await page.waitForTimeout(20000);
  
  console.log('\nAfter URL:', page.url());
  await page.screenshot({ path: '/tmp/aihubmix-v12-after.png', fullPage: true });
  
  const afterText = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  console.log('After text:', afterText.replace(/\n+/g, ' | ').slice(0, 2500));
  
  // Check errors
  const errors = await page.evaluate(() => {
    return [...document.querySelectorAll('[role="alert"], [class*="error"], [class*="cl-"]')]
      .filter(e => e.offsetParent !== null && e.innerText.trim().length > 2)
      .map(e => e.innerText.trim().slice(0, 300));
  });
  console.log('Errors/alerts:', JSON.stringify(errors));
  
  // Print all intercepted requests
  console.log('\n=== Network Requests ===');
  for (const r of requests) {
    console.log(`${r.method} ${r.url}`);
  }
  
  // If on dashboard, look for API keys
  if (page.url().includes('console.aihubmix.com') && !page.url().includes('sign')) {
    console.log('\n🔑 ON DASHBOARD!');
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    console.log(bodyText.replace(/\n+/g, ' | ').slice(0, 2000));
    
    // Try to create API key
    try {
      await page.click('button:has-text("Create API key")', { timeout: 5000 });
      await page.waitForTimeout(5000);
      await page.screenshot({ path: '/tmp/aihubmix-v12-key.png', fullPage: true });
      const keyText = await page.evaluate(() => document.body.innerText);
      const skMatch = keyText.match(/sk-[a-zA-Z0-9_-]{10,}/g);
      if (skMatch) {
        console.log('\n🔑🔑🔑 FOUND KEY:', skMatch[0]);
        fs.writeFileSync('/tmp/aihubmix-api-key.txt', skMatch[0]);
      }
    } catch (e) {
      console.log('No Create API key button or failed:', e.message.slice(0, 100));
    }
  }
  
} catch (e) {
  console.log('ERROR:', e.message);
  await page.screenshot({ path: '/tmp/aihubmix-v12-error.png' }).catch(() => {});
} finally {
  await browser.close();
}
