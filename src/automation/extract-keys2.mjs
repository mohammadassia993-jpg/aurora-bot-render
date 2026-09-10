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

// ---------- Gumroad: try signup/login ----------
async function tryGumroad2() {
  console.log('=== GUMROAD V2 ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    // Try the main login page
    await page.goto('https://app.gumroad.com/signup', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    let url = page.url();
    let bodyText = await page.evaluate(() => document.body?.innerText || '');
    console.log('Gumroad signup URL:', url);
    console.log('Gumroad signup body:', bodyText.slice(0, 400));
    
    // Try different settings URL
    await page.goto('https://app.gumroad.com/settings/general', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    url = page.url();
    bodyText = await page.evaluate(() => document.body?.innerText || '');
    console.log('Gumroad settings URL:', url);
    console.log('Gumroad settings body:', bodyText.slice(0, 400));
    
    // Check if there's a token on the page
    const allLinks = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => a.href).filter(h => h.includes('api') || h.includes('token') || h.includes('key')));
    console.log('Gumroad API links:', allLinks.slice(0, 10));
    
    results.gumroad_v2 = { url, bodySnippet: bodyText.slice(0, 400), apiLinks: allLinks.slice(0, 10) };
  } catch (e) {
    results.gumroad_v2 = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Gumroad V2 ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// ---------- Sellfy: try fresh signup ----------
async function trySellfy2() {
  console.log('=== SELLFY V2 ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    // Try fresh signup
    await page.goto('https://sellfy.com/signup', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    let url = page.url();
    let bodyText = await page.evaluate(() => document.body?.innerText || '');
    console.log('Sellfy signup URL:', url);
    console.log('Sellfy signup body:', bodyText.slice(0, 500));
    
    // Check for signup form
    const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, name: i.name, placeholder: i.placeholder })));
    console.log('Sellfy inputs:', JSON.stringify(inputs.slice(0, 10)));
    
    results.sellfy_v2 = { url, bodySnippet: bodyText.slice(0, 500), inputs: inputs.slice(0, 10) };
  } catch (e) {
    results.sellfy_v2 = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Sellfy V2 ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// ---------- Payhip: try correct URL ----------
async function tryPayhip2() {
  console.log('=== PAYHIP V2 ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    // Try different URLs
    const urls = [
      'https://payhip.com/login',
      'https://app.payhip.com/login',
      'https://payhip.com/dashboard',
      'https://payhip.com/signup',
    ];
    for (const u of urls) {
      await page.goto(u, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      const url = page.url();
      const bodyText = await page.evaluate(() => document.body?.innerText || '');
      console.log(`Payhip ${u} => ${url} : ${bodyText.slice(0, 150)}`);
      if (bodyText.length > 10 && !bodyText.includes('404')) {
        results.payhip_v2 = { url, bodySnippet: bodyText.slice(0, 400) };
        break;
      }
    }
    if (!results.payhip_v2) results.payhip_v2 = { status: 'all_urls_404' };
  } catch (e) {
    results.payhip_v2 = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Payhip V2 ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// ---------- Etsy: try API registration ----------
async function tryEtsy2() {
  console.log('=== ETSY V2 ===');
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  try {
    // Try Etsy developer portal
    await page.goto('https://www.etsy.com/developers/register', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    let url = page.url();
    let bodyText = await page.evaluate(() => document.body?.innerText || '');
    console.log('Etsy register URL:', url);
    console.log('Etsy register body:', bodyText.slice(0, 400));
    
    // Check for redirect
    if (url.includes('sanctions') || bodyText.includes('sanctions')) {
      console.log('Etsy: BLOCKED by sanctions policy');
      results.etsy_v2 = { status: 'region_blocked', url };
    } else {
      const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, name: i.name, placeholder: i.placeholder })));
      results.etsy_v2 = { url, bodySnippet: bodyText.slice(0, 400), inputs: inputs.slice(0, 10) };
    }
  } catch (e) {
    results.etsy_v2 = { status: 'error', error: e.message.slice(0, 300) };
    console.log('Etsy V2 ERROR:', e.message.slice(0, 200));
  }
  await browser.close();
  await save();
}

// Run all
await tryGumroad2();
await trySellfy2();
await tryPayhip2();
await tryEtsy2();

console.log('\n=== ALL DONE ===');
await save();
console.log(JSON.stringify(results, null, 2));
