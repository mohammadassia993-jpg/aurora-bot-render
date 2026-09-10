import { chromium } from 'playwright';
import fs from 'node:fs';

const results = {};
const outFile = '/root/silent-giants/deliverables/keys/keys.json';
fs.mkdirSync('/root/silent-giants/deliverables/keys', { recursive: true });

async function save() { fs.writeFileSync(outFile, JSON.stringify(results, null, 2)); }

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';

async function launchBrowser() {
  return chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
}

// ---------- Gumroad: Try Google OAuth signup ----------
async function tryGumroadSignup() {
  console.log('=== GUMROAD SIGNUP ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    // Try signup with email
    await page.goto('https://gumroad.com/signup', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Fill email signup form
    const emailInput = await page.$('input[name="email"], input[type="email"]');
    const passInput = await page.$('input[name="password"], input[type="password"]');
    
    if (emailInput && passInput) {
      await emailInput.fill('auroraalmada4@gmail.com');
      await passInput.fill('SilentWeb3#2026!');
      
      // Submit
      const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForTimeout(5000);
        const url = page.url();
        const body = await page.evaluate(() => document.body?.innerText || '');
        console.log('Gumroad signup result URL:', url);
        console.log('Gumroad signup result body:', body.slice(0, 500));
        results.gumroad_signup = { url, body: body.slice(0, 500) };
      } else {
        console.log('No submit button found');
        results.gumroad_signup = { status: 'no_submit_button' };
      }
    } else {
      console.log('No email/password inputs found');
      results.gumroad_signup = { status: 'no_inputs' };
    }
  } catch (e) {
    results.gumroad_signup = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Gumroad signup ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// ---------- Sellfy: Fresh signup ----------
async function trySellfySignup() {
  console.log('=== SELLFY SIGNUP ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://sellfy.com/auth/signup/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Fill signup form
    const nameInput = await page.$('input[name="first_name"]');
    const emailInput = await page.$('input[name="email"]');
    const passInput = await page.$('input[name="password"]');
    
    if (nameInput && emailInput && passInput) {
      await nameInput.fill('Silent Giants');
      await emailInput.fill('auroraalmada4@gmail.com');
      await passInput.fill('SilentWeb3#2026!');
      
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForTimeout(8000);
        const url = page.url();
        const body = await page.evaluate(() => document.body?.innerText || '');
        console.log('Sellfy signup result URL:', url);
        console.log('Sellfy signup result body:', body.slice(0, 500));
        results.sellfy_signup = { url, body: body.slice(0, 500) };
        
        // If signup succeeded, try to find API key
        if (url.includes('dashboard') || url.includes('settings')) {
          await page.goto('https://sellfy.com/settings/api', { timeout: 30000, waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(3000);
          const apiUrl = page.url();
          const apiBody = await page.evaluate(() => document.body?.innerText || '');
          console.log('Sellfy API page:', apiUrl, apiBody.slice(0, 300));
          results.sellfy_api = { url: apiUrl, body: apiBody.slice(0, 500) };
          
          // Look for API key
          const keyMatch = apiBody.match(/[A-Za-z0-9_-]{30,}/);
          if (keyMatch) {
            results.sellfy_api_key = keyMatch[0];
            console.log('Sellfy API KEY FOUND:', keyMatch[0].slice(0, 15) + '...');
          }
        }
      }
    } else {
      console.log('Sellfy: missing inputs', { name: !!nameInput, email: !!emailInput, pass: !!passInput });
      results.sellfy_signup = { status: 'missing_inputs' };
    }
  } catch (e) {
    results.sellfy_signup = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Sellfy signup ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// ---------- Payhip: Try signup then API ----------
async function tryPayhipSignup() {
  console.log('=== PAYHIP SIGNUP ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    // Go to login page first, then find signup link
    await page.goto('https://payhip.com/auth/login', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Find signup link
    const signupLink = await page.$('a[href*="signup"], a:has-text("Signup")');
    if (signupLink) {
      await signupLink.click();
      await page.waitForTimeout(3000);
    } else {
      await page.goto('https://payhip.com/auth/signup', { timeout: 15000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
    }
    
    const url = page.url();
    const body = await page.evaluate(() => document.body?.innerText || '');
    console.log('Payhip signup URL:', url);
    console.log('Payhip signup body:', body.slice(0, 500));
    
    // Fill signup form
    const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, name: i.name, placeholder: i.placeholder })));
    console.log('Payhip inputs:', JSON.stringify(inputs));
    
    results.payhip_signup = { url, body: body.slice(0, 500), inputs };
  } catch (e) {
    results.payhip_signup = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Payhip signup ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// Run all
await tryGumroadSignup();
await trySellfySignup();
await tryPayhipSignup();

console.log('\n=== ALL DONE ===');
await save();
console.log(JSON.stringify(results, null, 2));
