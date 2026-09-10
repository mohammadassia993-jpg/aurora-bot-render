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

// =========== GUMROAD: Find API key in settings ===========
async function tryGumroad() {
  console.log('=== GUMROAD API KEY ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    const auth = JSON.parse(fs.readFileSync('/root/silent-giants/auth/gumroad.json', 'utf8'));
    await ctx.addCookies(auth.cookies);
    console.log('Cookies loaded');

    // Gumroad settings - check Advanced section for API keys
    // The sidebar showed: Team, Payments, Billing, Password and authentication, 
    // Social connections, Third-party analytics, Advanced
    const settingsUrls = [
      'https://gumroad.com/settings/advanced',
      'https://gumroad.com/settings/apps',
      'https://gumroad.com/settings/integrations',
      'https://gumroad.com/settings/developer',
    ];

    for (const u of settingsUrls) {
      try {
        await page.goto(u, { timeout: 15000, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        const finalUrl = page.url();
        const body = await page.evaluate(() => document.body?.innerText || '');
        console.log(`${u} => ${finalUrl}`);
        console.log(`  Body: ${body.slice(0, 400)}`);
        
        if (body.toLowerCase().includes('api') || body.toLowerCase().includes('key') || body.toLowerCase().includes('token')) {
          results.gumroad_api_page = { url: finalUrl, body: body.slice(0, 800) };
          
          // Search for API key patterns
          const allText = body;
          const keyPatterns = [
            /api[_ ]?key[:\s]*([A-Za-z0-9_-]{20,})/i,
            /token[:\s]*([A-Za-z0-9_-]{20,})/i,
            /secret[:\s]*([A-Za-z0-9_-]{20,})/i,
            /access[_ ]?(?:key|token)[:\s]*([A-Za-z0-9_-]{20,})/i,
            /authorization[:\s]*(Bearer\s+)?([A-Za-z0-9._-]{20,})/i,
          ];
          for (const p of allText.matchAll(/([A-Za-z0-9_-]{30,})/g)) {
            // Check if it looks like an API key
            const val = p[1];
            if (val.length >= 20 && /^[A-Za-z0-9_-]+$/.test(val)) {
              console.log('  Possible key:', val.slice(0, 20) + '...');
            }
          }
        }
      } catch (e) {
        console.log(`  ERROR: ${e.message.slice(0, 80)}`);
      }
    }

    // Also click on the settings page links
    await page.goto('https://gumroad.com/settings', { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    // Get all links on the settings page
    const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText?.trim(), href: a.href })).filter(l => l.href.includes('settings') || l.href.includes('api') || l.href.includes('advanced')));
    console.log('\nSettings links:', JSON.stringify(links, null, 2));
    
    // Try clicking on "Advanced" link
    const advancedLink = links.find(l => l.text?.includes('Advanced'));
    if (advancedLink) {
      await page.goto(advancedLink.href, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const body = await page.evaluate(() => document.body?.innerText || '');
      console.log('\nAdvanced page body:', body.slice(0, 1000));
      results.gumroad_advanced = { body: body.slice(0, 1000) };
    }

    // Check for any webhook/API related elements
    const apiElements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, code, pre, .code, [class*="key"], [class*="token"]')).map(e => ({
        tag: e.tagName,
        type: e.type,
        value: e.value?.slice(0, 50),
        text: e.innerText?.slice(0, 50),
        className: e.className?.slice(0, 50)
      }));
    });
    console.log('\nAPI-related elements:', JSON.stringify(apiElements.filter(e => e.value || e.text).slice(0, 20)));
    
  } catch (e) {
    results.gumroad = { status: 'error', error: e.message.slice(0, 300) };
    console.log('ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// =========== SELLFY: Complete Google OAuth flow ===========
async function trySellfy() {
  console.log('\n=== SELLFY GOOGLE OAUTH ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://sellfy.com/auth/signup/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    
    // Click Google button - it redirects instead of popup
    const googleBtn = await page.$('button:has-text("Google"), a:has-text("Google"), a:has-text("Sign up with Google")');
    if (googleBtn) {
      console.log('Clicking Google OAuth button...');
      await googleBtn.click();
      await page.waitForTimeout(5000);
      
      const url = page.url();
      console.log('Current URL:', url);
      
      if (url.includes('accounts.google.com')) {
        // We're on Google sign-in page in the same tab
        await page.waitForTimeout(2000);
        
        // Fill email
        const emailInput = await page.$('input[type="email"], input[name="identifier"]');
        if (emailInput) {
          await emailInput.fill('auroraalmada4@gmail.com');
          console.log('Filled email');
          await page.waitForTimeout(1000);
          
          const nextBtn = await page.$('#identifierNext, button:has-text("Next")');
          if (nextBtn) {
            await nextBtn.click();
            console.log('Clicked Next');
            await page.waitForTimeout(5000);
            
            const afterUrl = page.url();
            const body = await page.evaluate(() => document.body?.innerText?.slice(0, 400) || '');
            console.log('After email:', afterUrl);
            console.log('Body:', body);
            
            // Check if password field appeared
            const passInput = await page.$('input[type="password"], input[name="password"]');
            if (passInput) {
              await passInput.fill('SilentWeb3#2026!');
              console.log('Filled password');
              await page.waitForTimeout(1000);
              
              const passNext = await page.$('#passwordNext, button:has-text("Next")');
              if (passNext) {
                await passNext.click();
                console.log('Clicked password Next');
                await page.waitForTimeout(10000);
                
                const finalUrl = page.url();
                const finalBody = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
                console.log('Final URL:', finalUrl);
                console.log('Final body:', finalBody);
                results.sellfy_oauth = { url: finalUrl, body: finalBody };
                
                // If redirected back to Sellfy
                if (finalUrl.includes('sellfy')) {
                  // Go to API settings
                  await page.goto('https://sellfy.com/settings/api', { timeout: 20000, waitUntil: 'domcontentloaded' });
                  await page.waitForTimeout(3000);
                  const apiBody = await page.evaluate(() => document.body?.innerText || '');
                  console.log('\nSellfy API page:', apiBody.slice(0, 500));
                  results.sellfy_api = { body: apiBody.slice(0, 500) };
                }
              }
            } else {
              console.log('No password field. Page body:', body);
              results.sellfy_oauth = { status: 'no_password_field', url: afterUrl, body };
            }
          }
        } else {
          console.log('No email input found');
          results.sellfy_oauth = { status: 'no_email_input', url };
        }
      }
    }
  } catch (e) {
    results.sellfy = { status: 'error', error: e.message.slice(0, 300) };
    console.log('ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

await tryGumroad();
await trySellfy();

console.log('\n=== ALL DONE ===');
await save();
console.log(JSON.stringify(results, null, 2));
