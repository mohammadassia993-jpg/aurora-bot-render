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

// =========== GUMROAD: Use saved cookies on app.gumroad.com ===========
async function tryGumroad() {
  console.log('=== GUMROAD (cookies on app.gumroad.com) ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    const auth = JSON.parse(fs.readFileSync('/root/silent-giants/auth/gumroad.json', 'utf8'));
    await ctx.addCookies(auth.cookies);
    console.log('Loaded', auth.cookies.length, 'cookies');

    // Try app.gumroad.com first (the main dashboard)
    const urls = [
      'https://app.gumroad.com/products',
      'https://app.gumroad.com/settings',
      'https://app.gumroad.com/settings/api',
      'https://app.gumroad.com/settings/advanced',
      'https://app.gumroad.com/settings/apps',
      'https://app.gumroad.com/',
    ];

    for (const u of urls) {
      try {
        await page.goto(u, { timeout: 20000, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        const finalUrl = page.url();
        const body = await page.evaluate(() => document.body?.innerText || '');
        console.log(`${u}\n  => ${finalUrl}\n  => ${body.slice(0, 200)}`);
        
        if (finalUrl.includes('login') || finalUrl.includes('sign_in')) {
          console.log('  => NOT LOGGED IN');
          results.gumroad = { status: 'session_expired', finalUrl };
          break;
        }
        
        if (finalUrl.includes('settings') && body.length > 50) {
          console.log('  => LOGGED IN! checking for API key...');
          // Look for API key in the page
          const allText = body;
          const keyPatterns = [
            /api[_ ]?key[:\s]*([A-Za-z0-9_-]{20,})/i,
            /token[:\s]*([A-Za-z0-9_-]{20,})/i,
            /secret[:\s]*([A-Za-z0-9_-]{20,})/i,
            /access[_ ]?key[:\s]*([A-Za-z0-9_-]{20,})/i,
          ];
          for (const p of keyPatterns) {
            const m = allText.match(p);
            if (m) {
              console.log('  => FOUND KEY:', m[1].slice(0, 15) + '...');
              results.gumroad = { status: 'key_found', key: m[1], url: finalUrl };
              break;
            }
          }
          if (!results.gumroad) {
            results.gumroad = { status: 'logged_in_no_key', url: finalUrl, body: body.slice(0, 800) };
          }
          
          // Also check if there's a dedicated API page
          if (finalUrl !== 'https://app.gumroad.com/settings/api') {
            await page.goto('https://app.gumroad.com/settings/api', { timeout: 15000, waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);
            const apiBody = await page.evaluate(() => document.body?.innerText || '');
            console.log('  API page body:', apiBody.slice(0, 300));
            const apiKeyMatch = apiBody.match(/([A-Z0-9]{20,})/);
            if (apiKeyMatch) {
              results.gumroad_api = { key: apiKeyMatch[1], body: apiBody.slice(0, 500) };
              console.log('  API KEY:', apiKeyMatch[1].slice(0, 15) + '...');
            }
          }
          break;
        }
      } catch (e) {
        console.log(`  ERROR: ${e.message.slice(0, 100)}`);
      }
    }
  } catch (e) {
    results.gumroad = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Gumroad FATAL:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// =========== PAYHIP: Try password reset and direct login ===========
async function tryPayhip() {
  console.log('\n=== PAYHIP (try login + password reset) ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    // Try to access the Payhip API directly (some platforms have API login)
    // First check if there's an API endpoint
    const apiUrls = [
      'https://payhip.com/api/v1',
      'https://payhip.com/api/v2',
      'https://api.payhip.com',
    ];
    for (const u of apiUrls) {
      try {
        await page.goto(u, { timeout: 10000, waitUntil: 'domcontentloaded' });
        const body = await page.evaluate(() => document.body?.innerText?.slice(0, 200) || '');
        console.log(`${u}: ${body.slice(0, 100)}`);
      } catch (e) { console.log(`${u}: timeout`); }
    }

    // Try password reset
    await page.goto('https://payhip.com/auth/login', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Click "Reset it" link
    const resetLink = await page.$('a:has-text("Reset"), a:has-text("Forgot"), a[href*="reset"], a[href*="forgot"]');
    if (resetLink) {
      await resetLink.click();
      await page.waitForTimeout(3000);
      const resetUrl = page.url();
      console.log('Reset URL:', resetUrl);
      
      // Fill email
      const emailInput = await page.$('input[type="email"], input[name="email"], input[name="login"]');
      if (emailInput) {
        await emailInput.fill('auroraalmada4@gmail.com');
        const submitBtn = await page.$('button[type="submit"], button:has-text("Reset"), button:has-text("Send")');
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(5000);
          const body = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
          console.log('Reset result:', body);
          results.payhip = { status: 'password_reset_sent', body };
        }
      }
    } else {
      console.log('No reset link found');
      results.payhip = { status: 'no_reset_link' };
    }
  } catch (e) {
    results.payhip = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Payhip ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// =========== SELLFY: Try Google OAuth ===========
async function trySellfy() {
  console.log('\n=== SELLFY (Google OAuth) ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://sellfy.com/auth/signup/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    
    // Find Google signup button
    const googleBtn = await page.$('button:has-text("Google"), a:has-text("Google"), [data-provider="google"]');
    if (googleBtn) {
      console.log('Found Google button, clicking...');
      
      // Handle popup
      const [popup] = await Promise.all([
        ctx.waitForEvent('page', { timeout: 15000 }).catch(() => null),
        googleBtn.click()
      ]);
      
      if (popup) {
        console.log('Google popup opened:', popup.url());
        await popup.waitForTimeout(3000);
        const popupBody = await popup.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
        console.log('Popup body:', popupBody);
        results.sellfy = { status: 'google_oauth_popup', url: popup.url(), body: popupBody };
        
        // Try to fill Google login
        const emailInput = await popup.$('input[type="email"]');
        if (emailInput) {
          await emailInput.fill('auroraalmada4@gmail.com');
          const nextBtn = await popup.$('button:has-text("Next"), #identifierNext');
          if (nextBtn) {
            await nextBtn.click();
            await popup.waitForTimeout(5000);
            const afterEmail = await popup.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
            console.log('After email:', afterEmail);
          }
        }
      } else {
        console.log('No popup, checking current page...');
        const url = page.url();
        const body = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
        results.sellfy = { status: 'no_popup', url, body };
      }
    } else {
      console.log('No Google button found');
      // Try different selectors
      const allBtns = await page.evaluate(() => Array.from(document.querySelectorAll('button, a')).filter(b => b.innerText.includes('Google') || b.className.includes('google')).map(b => b.outerHTML.slice(0, 200)));
      console.log('Google-related elements:', allBtns);
      results.sellfy = { status: 'no_google_button' };
    }
  } catch (e) {
    results.sellfy = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Sellfy ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// Run all
await tryGumroad();
await tryPayhip();
await trySellfy();

console.log('\n=== ALL DONE ===');
await save();
console.log(JSON.stringify(results, null, 2));
