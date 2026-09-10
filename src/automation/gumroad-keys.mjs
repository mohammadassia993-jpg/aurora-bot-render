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

// Try Gumroad with cookies - navigate to different URLs to find API key
async function tryGumroadWithCookies() {
  console.log('=== GUMROAD WITH COOKIES ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    // Load cookies
    const auth = JSON.parse(fs.readFileSync('/root/silent-giants/auth/gumroad.json', 'utf8'));
    await ctx.addCookies(auth.cookies);
    console.log('Loaded', auth.cookies.length, 'cookies');
    
    // Try multiple URLs to check auth
    const urls = [
      'https://app.gumroad.com/',
      'https://app.gumroad.com/products',
      'https://app.gumroad.com/settings',
      'https://app.gumroad.com/settings/api',
      'https://app.gumroad.com/settings/advanced',
      'https://app.gumroad.com/dashboard',
    ];
    
    for (const u of urls) {
      await page.goto(u, { timeout: 20000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      const finalUrl = page.url();
      const body = await page.evaluate(() => document.body?.innerText?.slice(0, 200) || '');
      console.log(`${u} => ${finalUrl} : ${body.slice(0, 100)}`);
      
      if (finalUrl.includes('login') || finalUrl.includes('sign_in')) {
        console.log('NOT logged in on app.gumroad.com');
        results.gumroad_auth = { status: 'not_logged_in' };
        break;
      }
      
      // Check for API key patterns
      if (body.toLowerCase().includes('api') || finalUrl.includes('api')) {
        const fullBody = await page.evaluate(() => document.body?.innerText || '');
        const keyMatch = fullBody.match(/(?:API\s*(?:Key|Token|Access)[:\s]*|api[_-]?key[:\s"']*)([A-Za-z0-9_-]{20,})/i);
        if (keyMatch) {
          console.log('FOUND API KEY:', keyMatch[1].slice(0, 15) + '...');
          results.gumroad_api_key = keyMatch[1];
        }
        results.gumroad_api_page = { url: finalUrl, body: fullBody.slice(0, 800) };
      }
    }
    
    // Also try the Gumroad API directly (v1)
    const apiPage = await ctx.newPage();
    await apiPage.goto('https://api.gumroad.com/v2/user', { timeout: 15000, waitUntil: 'domcontentloaded' });
    await apiPage.waitForTimeout(2000);
    const apiBody = await apiPage.evaluate(() => document.body?.innerText || '');
    console.log('Gumroad API v2/user:', apiBody.slice(0, 500));
    results.gumroad_api_direct = apiBody.slice(0, 500);
    
  } catch (e) {
    results.gumroad_error = { error: e.message.slice(0, 300) };
    console.log('ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// Try Gumroad login page with proper selectors
async function tryGumroadLogin() {
  console.log('\n=== GUMROAD LOGIN PAGE ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://gumroad.com/login', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const url = page.url();
    console.log('Login URL:', url);
    
    // Wait for dynamic form
    await page.waitForSelector('input', { timeout: 10000 }).catch(() => console.log('No input found'));
    const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => ({
      type: i.type, name: i.name, id: i.id, placeholder: i.placeholder
    })));
    console.log('Login inputs:', JSON.stringify(inputs));
    
    // Try to fill by type selector (wait for React to render)
    try {
      await page.waitForSelector('input[type="email"]', { timeout: 5000 });
      await page.fill('input[type="email"]', 'auroraalmada4@gmail.com');
      await page.fill('input[type="password"]', 'SilentWeb3#2026!');
      await page.waitForTimeout(500);
      
      // Find and click Log in button
      const loginBtn = await page.$('button:has-text("Log in"), button:has-text("Log In"), button[type="submit"]');
      if (loginBtn) {
        await loginBtn.click();
        await page.waitForTimeout(8000);
        const afterUrl = page.url();
        const afterBody = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
        console.log('After login:', afterUrl);
        console.log('Body:', afterBody);
        results.gumroad_login = { url: afterUrl, body: afterBody };
        
        if (!afterUrl.includes('login')) {
          // We're logged in! Go to API settings
          await page.goto('https://app.gumroad.com/settings/api', { timeout: 20000, waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(3000);
          const apiBody = await page.evaluate(() => document.body?.innerText || '');
          console.log('API Settings:', apiBody.slice(0, 500));
          results.gumroad_api_settings = apiBody.slice(0, 500);
        }
      }
    } catch (e) {
      console.log('Form fill error:', e.message.slice(0, 200));
    }
  } catch (e) {
    results.gumroad_login_error = { error: e.message.slice(0, 300) };
    console.log('ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

await tryGumroadWithCookies();
await tryGumroadLogin();

console.log('\n=== DONE ===');
await save();
console.log(JSON.stringify(results, null, 2));
