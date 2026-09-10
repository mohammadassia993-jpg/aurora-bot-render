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

// ---------- Gumroad ----------
async function tryGumroad() {
  console.log('=== GUMROAD ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ 
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    try {
      const auth = JSON.parse(fs.readFileSync('/root/silent-giants/auth/gumroad.json', 'utf8'));
      if (auth.cookies) {
        await ctx.addCookies(auth.cookies);
        console.log('Gumroad: loaded', auth.cookies.length, 'cookies');
      }
    } catch (e) { console.log('Gumroad: no cookies', e.message); }
    
    await page.goto('https://app.gumroad.com/settings', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const url = page.url();
    console.log('Gumroad URL:', url);
    
    if (url.includes('login') || url.includes('sign_in')) {
      console.log('Gumroad: needs login');
      results.gumroad = { status: 'needs_login', url };
    } else {
      // Try to find API key
      await page.goto('https://app.gumroad.com/settings/api', { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const content = await page.content();
      const bodyText = await page.evaluate(() => document.body?.innerText || '');
      
      // Look for API key patterns
      const patterns = [
        /API Key[:\s]*([A-Za-z0-9_-]{20,})/i,
        /api_key[:\s"']*([A-Za-z0-9_-]{20,})/i,
        /Token[:\s]*([A-Za-z0-9_-]{20,})/i,
      ];
      let found = null;
      for (const p of patterns) {
        const m = bodyText.match(p) || content.match(p);
        if (m) { found = m[1]; break; }
      }
      
      if (found) {
        results.gumroad = { status: 'key_found', key: found };
        console.log('Gumroad: KEY FOUND:', found.slice(0, 10) + '...');
      } else {
        console.log('Gumroad: no key on page. Body:', bodyText.slice(0, 300));
        results.gumroad = { status: 'page_loaded_no_key', bodySnippet: bodyText.slice(0, 400) };
      }
    }
  } catch (e) {
    results.gumroad = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Gumroad ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// ---------- Sellfy ----------
async function trySellfy() {
  console.log('=== SELLFY ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    try {
      const auth = JSON.parse(fs.readFileSync('/root/silent-giants/auth/sellfy.json', 'utf8'));
      if (auth.cookies) {
        await ctx.addCookies(auth.cookies);
        console.log('Sellfy: loaded', auth.cookies.length, 'cookies');
      }
    } catch (e) { console.log('Sellfy: no cookies', e.message); }
    
    await page.goto('https://sellfy.com/dashboard', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const url = page.url();
    console.log('Sellfy URL:', url);
    
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    
    if (url.includes('login') || url.includes('sign') || bodyText.includes('deleted')) {
      console.log('Sellfy: needs login or store deleted');
      results.sellfy = { status: 'needs_login_or_deleted', url, body: bodyText.slice(0, 300) };
    } else {
      // Try API settings
      await page.goto('https://sellfy.com/settings/api', { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const content = await page.content();
      const apiText = await page.evaluate(() => document.body?.innerText || '');
      
      const patterns = [/API Key[:\s]*([A-Za-z0-9_-]{20,})/i, /api_key[:\s"']*([A-Za-z0-9_-]{20,})/i];
      let found = null;
      for (const p of patterns) {
        const m = apiText.match(p) || content.match(p);
        if (m) { found = m[1]; break; }
      }
      
      if (found) {
        results.sellfy = { status: 'key_found', key: found };
        console.log('Sellfy: KEY FOUND:', found.slice(0, 10) + '...');
      } else {
        console.log('Sellfy: body:', apiText.slice(0, 300));
        results.sellfy = { status: 'page_loaded_no_key', bodySnippet: apiText.slice(0, 400) };
      }
    }
  } catch (e) {
    results.sellfy = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Sellfy ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// ---------- Payhip ----------
async function tryPayhip() {
  console.log('=== PAYHIP ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://payhip.com/login', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const url = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    console.log('Payhip URL:', url);
    console.log('Payhip body:', bodyText.slice(0, 300));
    results.payhip = { status: 'login_page', bodySnippet: bodyText.slice(0, 400) };
  } catch (e) {
    results.payhip = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Payhip ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// ---------- Etsy ----------
async function tryEtsy() {
  console.log('=== ETSY ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://www.etsy.com/developers', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const url = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    console.log('Etsy URL:', url);
    console.log('Etsy body:', bodyText.slice(0, 300));
    results.etsy = { status: 'checked', url, bodySnippet: bodyText.slice(0, 400) };
  } catch (e) {
    results.etsy = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Etsy ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// Run all sequentially
try {
  await tryGumroad();
} catch(e) { console.log('Gumroad pipeline error:', e.message); }

try {
  await trySellfy();
} catch(e) { console.log('Sellfy pipeline error:', e.message); }

try {
  await tryPayhip();
} catch(e) { console.log('Payhip pipeline error:', e.message); }

try {
  await tryEtsy();
} catch(e) { console.log('Etsy pipeline error:', e.message); }

console.log('\n=== ALL DONE ===');
await save();
console.log(JSON.stringify(results, null, 2));
