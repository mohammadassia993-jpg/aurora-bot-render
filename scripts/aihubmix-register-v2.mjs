import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const cookiesPath = '/root/silent-giants/auth/aihubmix.json';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 }
});

// Load existing cookies if any
if (fs.existsSync(cookiesPath)) {
  const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
  await ctx.addCookies(cookies);
  console.log('Loaded existing cookies');
}

const page = await ctx.newPage();

try {
  // Step 1: Go to signup page directly
  console.log('1. Navigating to AIHubMix signup...');
  await page.goto('https://aihubmix.com/user/register', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());
  
  // Take screenshot of initial state
  await page.screenshot({ path: '/tmp/aihubmix-v2-step1.png' });
  
  // Get all visible text
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 5000));
  console.log('Body:', bodyText.replace(/\n+/g, ' | ').slice(0, 2000));
  
  // Get all inputs
  const inputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input, textarea')].map(i => ({
      type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
      visible: i.offsetParent !== null, rect: i.getBoundingClientRect()
    }));
  });
  console.log('\nInputs:', JSON.stringify(inputs, null, 2));
  
  // Get all buttons
  const buttons = await page.evaluate(() => {
    return [...document.querySelectorAll('button, a[href*="sign"], a[href*="register"]')].filter(e => e.offsetParent !== null).map(e => ({
      text: (e.innerText || '').trim().slice(0, 50),
      href: e.href || '',
      tag: e.tagName,
      type: e.type
    }));
  });
  console.log('\nButtons/Links:', JSON.stringify(buttons, null, 2));

} catch (e) {
  console.log('ERROR:', e.message.slice(0, 500));
} finally {
  await browser.close();
}
