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

// ---------- Sellfy: Fill form properly ----------
async function trySellfy() {
  console.log('=== SELLFY SIGNUP ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://sellfy.com/auth/signup/', { timeout: 30000, waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Fill form using selector
    await page.fill('input[name="first_name"]', 'Silent Giants');
    await page.fill('input[name="email"]', 'auroraalmada4@gmail.com');
    await page.fill('input[name="password"]', 'SilentWeb3#2026!');
    await page.waitForTimeout(1000);
    
    // Click Next button
    const nextBtn = await page.$('button:has-text("Next"), button[type="submit"]');
    if (nextBtn) {
      console.log('Found Next button, clicking...');
      await nextBtn.click();
      await page.waitForTimeout(8000);
      const url = page.url();
      const body = await page.evaluate(() => document.body?.innerText || '');
      console.log('Sellfy after Next:', url);
      console.log('Sellfy body:', body.slice(0, 600));
      results.sellfy_step1 = { url, body: body.slice(0, 600) };
      
      // Check if we need to fill store name
      const storeInput = await page.$('input[name="store_name"], input[name="store_url"], input[placeholder*="store"]');
      if (storeInput) {
        console.log('Store name input found');
        await storeInput.fill('silentgiants');
        const submitBtn = await page.$('button:has-text("Create"), button:has-text("Start"), button[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(8000);
          const url2 = page.url();
          const body2 = await page.evaluate(() => document.body?.innerText || '');
          console.log('Sellfy after store:', url2);
          console.log('Sellfy body2:', body2.slice(0, 600));
          results.sellfy_step2 = { url: url2, body: body2.slice(0, 600) };
        }
      }
      
      // Try to access API settings
      await page.goto('https://sellfy.com/settings/api', { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const apiUrl = page.url();
      const apiBody = await page.evaluate(() => document.body?.innerText || '');
      console.log('Sellfy API page:', apiUrl);
      console.log('Sellfy API body:', apiBody.slice(0, 500));
      results.sellfy_api = { url: apiUrl, body: apiBody.slice(0, 500) };
    } else {
      console.log('No submit button found');
      // Dump all buttons
      const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button, [role="button"]')).map(b => b.innerText));
      console.log('Buttons:', buttons);
      results.sellfy_step1 = { status: 'no_button', buttons };
    }
  } catch (e) {
    results.sellfy = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Sellfy ERROR:', e.message.slice(0, 300));
  }
  await browser.close();
  await save();
}

// ---------- Payhip: Fill signup form ----------
async function tryPayhip() {
  console.log('=== PAYHIP SIGNUP ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://payhip.com/auth/register', { timeout: 30000, waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    await page.fill('input[name="first_name"]', 'Silent');
    await page.fill('input[name="last_name"]', 'Giants');
    await page.fill('input[name="email"]', 'auroraalmada4@gmail.com');
    await page.fill('input[name="password"]', 'SilentWeb3#2026!');
    await page.waitForTimeout(1000);
    
    const submitBtn = await page.$('button:has-text("Create"), button[type="submit"]');
    if (submitBtn) {
      console.log('Clicking Create account...');
      await submitBtn.click();
      await page.waitForTimeout(10000);
      const url = page.url();
      const body = await page.evaluate(() => document.body?.innerText || '');
      console.log('Payhip after signup:', url);
      console.log('Payhip body:', body.slice(0, 600));
      results.payhip_signup_result = { url, body: body.slice(0, 600) };
      
      // If dashboard, look for API
      if (url.includes('dashboard') || url.includes('settings')) {
        // Try API key page
        const apiUrls = [
          'https://payhip.com/merchant/api',
          'https://payhip.com/settings/api',
          'https://payhip.com/dashboard/settings/api',
        ];
        for (const apiUrl of apiUrls) {
          await page.goto(apiUrl, { timeout: 15000, waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          const u = page.url();
          const b = await page.evaluate(() => document.body?.innerText || '');
          console.log(`Payhip ${apiUrl} => ${u}: ${b.slice(0, 200)}`);
          if (b.length > 20 && !b.includes('404')) {
            results.payhip_api = { url: u, body: b.slice(0, 500) };
            break;
          }
        }
      }
    }
  } catch (e) {
    results.payhip = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Payhip ERROR:', e.message.slice(0, 300));
  }
  await browser.close();
  await save();
}

// ---------- Gumroad: Try different approach ----------
async function tryGumroad() {
  console.log('=== GUMROAD SIGNUP ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://gumroad.com/signup', { timeout: 30000, waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    // Dump full HTML to understand form structure
    const formHtml = await page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      return Array.from(forms).map(f => f.outerHTML.slice(0, 500));
    });
    console.log('Gumroad forms:', JSON.stringify(formHtml.slice(0, 3)));
    
    // Try all input types
    const allInputs = await page.evaluate(() => Array.from(document.querySelectorAll('input, [contenteditable]')).map(i => ({
      tag: i.tagName, type: i.type, name: i.name, placeholder: i.placeholder, 
      id: i.id, className: i.className?.slice(0, 50)
    })));
    console.log('Gumroad all inputs:', JSON.stringify(allInputs));
    
    // Try to find and click email button
    const emailBtn = await page.$('button:has-text("Email"), a:has-text("Email")');
    if (emailBtn) {
      console.log('Found email button, clicking...');
      await emailBtn.click();
      await page.waitForTimeout(2000);
      const newInputs = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder
      })));
      console.log('After click inputs:', JSON.stringify(newInputs));
      
      if (newInputs.find(i => i.type === 'email' || i.name === 'email')) {
        await page.fill('input[type="email"], input[name="email"]', 'auroraalmada4@gmail.com');
        await page.fill('input[type="password"], input[name="password"]', 'SilentWeb3#2026!');
        const btn = await page.$('button[type="submit"]');
        if (btn) {
          await btn.click();
          await page.waitForTimeout(8000);
          const url = page.url();
          const body = await page.evaluate(() => document.body?.innerText || '');
          console.log('Gumroad signup result:', url, body.slice(0, 400));
          results.gumroad_signup = { url, body: body.slice(0, 500) };
        }
      }
    }
  } catch (e) {
    results.gumroad = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Gumroad ERROR:', e.message.slice(0, 300));
  }
  await browser.close();
  await save();
}

await tryGumroad();
await trySellfy();
await tryPayhip();

console.log('\n=== ALL DONE ===');
await save();
console.log(JSON.stringify(results, null, 2));
