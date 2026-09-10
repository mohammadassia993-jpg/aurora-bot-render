import { chromium } from 'playwright';
import fs from 'node:fs';

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
async function launchBrowser() {
  return chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
}

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  
  // Capture network responses to catch the API call
  page.on('response', async (resp) => {
    if (resp.request().method() === 'POST' && (resp.url().includes('gumroad') || resp.url().includes('api'))) {
      console.log('POST:', resp.url());
      console.log('Status:', resp.status());
      try {
        const text = await resp.text();
        console.log('Body:', text.slice(0, 1000));
      } catch(e) {}
    }
    if (resp.request().method() === 'GET' && (resp.url().includes('applications') || resp.url().includes('oauth'))) {
      console.log('GET:', resp.url(), 'Status:', resp.status());
    }
  });
  
  try {
    const auth = JSON.parse(fs.readFileSync('/root/silent-giants/auth/gumroad.json', 'utf8'));
    await ctx.addCookies(auth.cookies);
    
    await page.goto('https://gumroad.com/settings/advanced', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Click Create application button (idx 7)
    await page.click('button:has-text("Create application")');
    console.log('Clicked Create application');
    await page.waitForTimeout(5000);
    
    // Check current URL and body
    const url = page.url();
    const body = await page.evaluate(() => document.body?.innerText || '');
    console.log('URL:', url);
    console.log('Body:', body.slice(0, 1000));
    
    // Check for modal or dialog
    const modal = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"], .modal, [class*="modal"], [class*="dialog"]');
      return Array.from(dialogs).map(d => d.innerText?.slice(0, 500));
    });
    console.log('Dialogs/modals:', JSON.stringify(modal));
    
    // Dump all inputs if a dialog appeared
    const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => ({
      type: i.type, id: i.id, name: i.name, placeholder: i.placeholder,
      value: i.value?.slice(0, 30), visible: i.offsetParent !== null
    })));
    console.log('All inputs:', JSON.stringify(inputs));
    
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 500));
  }
  await browser.close();
}

main();
