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

// ---------- Payhip: Login with correct selector ----------
async function tryPayhipLogin() {
  console.log('=== PAYHIP LOGIN V2 ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://payhip.com/auth/login', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Correct: login field is name="login"
    await page.fill('input[name="login"]', 'auroraalmada4@gmail.com');
    await page.fill('input[name="password"]', 'SilentWeb3#2026!');
    await page.waitForTimeout(1000);
    
    const btn = await page.$('button[type="submit"], button:has-text("Log in")');
    if (btn) {
      await btn.click();
      await page.waitForTimeout(10000);
      const url = page.url();
      const body = await page.evaluate(() => document.body?.innerText || '');
      console.log('Payhip login result:', url);
      console.log('Payhip body:', body.slice(0, 600));
      results.payhip_login2 = { url, body: body.slice(0, 600) };
      
      // Look for API key if logged in
      if (!url.includes('login') && !body.includes('Log into')) {
        const paths = ['/merchant/api', '/settings/api', '/developer', '/settings'];
        for (const p of paths) {
          await page.goto('https://payhip.com' + p, { timeout: 15000, waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          const u = page.url();
          const b = await page.evaluate(() => document.body?.innerText || '');
          console.log(`Payhip ${p}: ${u} | ${b.slice(0, 150)}`);
          if (b.length > 20 && !b.includes('404')) {
            results.payhip_api2 = { url: u, body: b.slice(0, 500) };
            if (p === '/merchant/api' || p === '/settings/api') break;
          }
        }
      }
    }
  } catch (e) {
    results.payhip_login2 = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Payhip ERROR:', e.message.slice(0, 300));
  }
  await browser.close();
  await save();
}

// ---------- Gumroad: debug what happens on submit ----------
async function tryGumroadDebug() {
  console.log('=== GUMROAD DEBUG ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://gumroad.com/signup', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Intercept network requests to see what happens on submit
    page.on('response', async (resp) => {
      if (resp.url().includes('gumroad') && resp.request().method() === 'POST') {
        console.log('POST to:', resp.url());
        console.log('Status:', resp.status());
        try { console.log('Body:', (await resp.text()).slice(0, 500)); } catch(e) {}
      }
    });
    
    const emailInput = await page.$('input[type="email"]');
    const passInput = await page.$('input[type="password"]');
    const errs1 = await page.evaluate(() => document.querySelectorAll('.error').length);
    await emailInput.fill('auroraalmada4@gmail.com');
    await passInput.fill('SilentWeb3#2026!');
    await page.waitForTimeout(500);
    
    const submit = await page.$('button[type="submit"]');
    await submit.click();
    await page.waitForTimeout(8000);
    
    // Check for error messages
    const errText = await page.evaluate(() => {
      const errs = document.querySelectorAll('.error, [class*="error"], [role="alert"]');
      return Array.from(errs).map(e => e.innerText).join(' | ');
    });
    console.log('Gumroad errors:', errText);
    const body = await page.evaluate(() => document.body?.innerText || '');
    console.log('Gumroad body after:', body.slice(0, 600));
    results.gumroad_debug = { errors: errText, body: body.slice(0, 600) };
  } catch (e) {
    results.gumroad_debug = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Gumroad ERROR:', e.message.slice(0, 300));
  }
  await browser.close();
  await save();
}

// ---------- Sellfy: debug button click ----------
async function trySellfyDebug() {
  console.log('=== SELLFY DEBUG ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://sellfy.com/auth/signup/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    
    page.on('response', async (resp) => {
      if (resp.request().method() === 'POST') {
        console.log('POST to:', resp.url());
        console.log('Status:', resp.status());
        try { console.log('Body:', (await resp.text()).slice(0, 300)); } catch(e) {}
      }
    });
    page.on('framenavigated', f => console.log('Frame navigated:', f.url()));
    
    await page.fill('input[name="first_name"]', 'Silent Giants');
    await page.fill('input[name="email"]', 'auroraalmada4@gmail.com');
    await page.fill('input[name="password"]', 'SilentWeb3#2026!');
    await page.waitForTimeout(1000);
    
    const nextBtn = await page.$('button:has-text("Next")');
    console.log('Next btn found:', !!nextBtn);
    if (nextBtn) {
      await nextBtn.click();
      await page.waitForTimeout(8000);
      const body = await page.evaluate(() => document.body?.innerText || '');
      console.log('Sellfy body after Next:', body.slice(0, 500));
      
      // Check for recaptcha iframes
      const iframes = await page.evaluate(() => Array.from(document.querySelectorAll('iframe')).map(f => f.src));
      console.log('Sellfy iframes:', iframes);
      results.sellfy_debug = { body: body.slice(0, 500), iframes };
    }
  } catch (e) {
    results.sellfy_debug = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Sellfy ERROR:', e.message.slice(0, 300));
  }
  await browser.close();
  await save();
}

await tryGumroadDebug();
await tryPayhipLogin();
await trySellfyDebug();

console.log('\n=== ALL DONE ===');
await save();
console.log(JSON.stringify(results, null, 2));
