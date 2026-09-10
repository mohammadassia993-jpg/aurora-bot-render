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

// ---------- Payhip: Login (account exists) ----------
async function tryPayhipLogin() {
  console.log('=== PAYHIP LOGIN ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://payhip.com/auth/login', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input:not([type="hidden"])')).map(i => ({
      type: i.type, name: i.name, placeholder: i.placeholder, id: i.id
    })));
    console.log('Payhip login inputs:', JSON.stringify(inputs));
    
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="Email"]', 'auroraalmada4@gmail.com');
    await page.fill('input[type="password"], input[name="password"], input[placeholder*="Password"]', 'SilentWeb3#2026!');
    await page.waitForTimeout(1000);
    
    const btn = await page.$('button[type="submit"], button:has-text("Log in"), button:has-text("Login")');
    if (btn) {
      await btn.click();
      await page.waitForTimeout(10000);
      const url = page.url();
      const body = await page.evaluate(() => document.body?.innerText || '');
      console.log('Payhip login result:', url);
      console.log('Payhip body:', body.slice(0, 600));
      results.payhip_login = { url, body: body.slice(0, 600) };
      
      if (url.includes('dashboard') || url.includes('settings')) {
        // Try to find API key page
        const tryUrls = ['/settings', '/merchant/api', '/settings/api', '/developer'];
        for (const path of tryUrls) {
          const base = url.includes('/dashboard') ? url.split('/dashboard')[0] : 'https://payhip.com';
          await page.goto(base + path, { timeout: 15000, waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          const u = page.url();
          const b = await page.evaluate(() => document.body?.innerText || '');
          if (b.length > 20 && !b.includes('404')) {
            console.log(`Payhip ${path}: ${u}`);
            console.log(b.slice(0, 300));
            results.payhip_api_page = { url: u, body: b.slice(0, 500) };
          }
        }
      }
    }
  } catch (e) {
    results.payhip_login = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Payhip ERROR:', e.message.slice(0, 300));
  }
  await browser.close();
  await save();
}

// ---------- Gumroad: Login with email/password using correct selectors ----------
async function tryGumroadLogin() {
  console.log('=== GUMROAD LOGIN ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://gumroad.com/signup', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Gumroad uses dynamic IDs - fill by type
    await page.fill('input[type="email"]', 'auroraalmada4@gmail.com');
    await page.fill('input[type="password"]', 'SilentWeb3#2026!');
    await page.waitForTimeout(1000);
    
    // Find the "Create account" or submit button
    const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.innerText?.trim(), type: b.type, disabled: b.disabled
    })));
    console.log('Gumroad buttons:', JSON.stringify(buttons));
    
    const createBtn = await page.$('button[type="submit"]');
    if (createBtn) {
      console.log('Clicking submit...');
      await createBtn.click();
      await page.waitForTimeout(10000);
      const url = page.url();
      const body = await page.evaluate(() => document.body?.innerText || '');
      console.log('Gumroad after submit:', url);
      console.log('Gumroad body:', body.slice(0, 600));
      results.gumroad_login = { url, body: body.slice(0, 600) };
      
      // If we're in, try to get API settings
      if (url.includes('settings') || url.includes('dashboard') || url.includes('products')) {
        await page.goto('https://gumroad.com/settings', { timeout: 15000, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        const apiUrl = page.url();
        const apiBody = await page.evaluate(() => document.body?.innerText || '');
        console.log('Gumroad settings:', apiUrl);
        console.log(apiBody.slice(0, 300));
        
        // Look for API section
        const apiLink = await page.$('a:has-text("API")');
        if (apiLink) {
          await apiLink.click();
          await page.waitForTimeout(3000);
          const keyBody = await page.evaluate(() => document.body?.innerText || '');
          console.log('Gumroad API:', keyBody.slice(0, 500));
          results.gumroad_api = { body: keyBody.slice(0, 500) };
        }
      }
    }
  } catch (e) {
    results.gumroad_login = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Gumroad ERROR:', e.message.slice(0, 300));
  }
  await browser.close();
  await save();
}

// ---------- Sellfy: Try with domcontentloaded ----------
async function trySellfy2() {
  console.log('=== SELLFY SIGNUP V2 ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://sellfy.com/auth/signup/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    
    const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input:not([type="hidden"])')).map(i => ({
      type: i.type, name: i.name, placeholder: i.placeholder
    })));
    console.log('Sellfy inputs:', JSON.stringify(inputs));
    
    if (inputs.find(i => i.name === 'first_name')) {
      await page.fill('input[name="first_name"]', 'Silent Giants');
      await page.fill('input[name="email"]', 'auroraalmada4@gmail.com');
      await page.fill('input[name="password"]', 'SilentWeb3#2026!');
      await page.waitForTimeout(1000);
      
      // Try clicking Next
      const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.innerText?.trim()));
      console.log('Sellfy buttons:', btns);
      
      const nextBtn = await page.$('button:not([disabled])');
      if (nextBtn) {
        const btnText = await nextBtn.evaluate(b => b.innerText?.trim());
        console.log('Clicking button:', btnText);
        await nextBtn.click();
        await page.waitForTimeout(10000);
        const url = page.url();
        const body = await page.evaluate(() => document.body?.innerText || '');
        console.log('Sellfy after click:', url);
        console.log('Sellfy body:', body.slice(0, 600));
        results.sellfy_signup = { url, body: body.slice(0, 600) };
        
        // If we got to a new page with more fields
        const newInputs = await page.evaluate(() => Array.from(document.querySelectorAll('input:not([type="hidden"])')).map(i => ({
          type: i.type, name: i.name, placeholder: i.placeholder
        })));
        console.log('Sellfy new inputs:', JSON.stringify(newInputs));
        
        if (newInputs.find(i => i.name?.includes('store') || i.placeholder?.includes('store'))) {
          const storeInput = await page.$('input[name*="store"], input[placeholder*="store"]');
          if (storeInput) {
            await storeInput.fill('silentgiantsweb3');
            const finishBtn = await page.$('button[type="submit"], button:has-text("Start"), button:has-text("Create")');
            if (finishBtn) {
              await finishBtn.click();
              await page.waitForTimeout(10000);
              const url2 = page.url();
              const body2 = await page.evaluate(() => document.body?.innerText || '');
              console.log('Sellfy after store:', url2);
              results.sellfy_step2 = { url: url2, body: body2.slice(0, 600) };
            }
          }
        }
      }
    }
  } catch (e) {
    results.sellfy = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Sellfy ERROR:', e.message.slice(0, 300));
  }
  await browser.close();
  await save();
}

await tryGumroadLogin();
await tryPayhipLogin();
await trySellfy2();

console.log('\n=== ALL DONE ===');
await save();
console.log(JSON.stringify(results, null, 2));
