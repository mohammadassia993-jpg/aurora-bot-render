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
  
  try {
    const auth = JSON.parse(fs.readFileSync('/root/silent-giants/auth/gumroad.json', 'utf8'));
    await ctx.addCookies(auth.cookies);
    
    // Go to advanced settings
    await page.goto('https://gumroad.com/settings/advanced', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Fill using the exact IDs found
    await page.fill('#\\:rc\\:-name', 'Silent Giants API');
    await page.fill('#\\:rc\\:-redirectUri', 'https://silent-giants.onrender.com/callback');
    console.log('Filled application name and redirect URI');
    await page.waitForTimeout(1000);
    
    // Find and click Create application button
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map((b, i) => ({
        idx: i,
        text: b.innerText?.trim(),
        type: b.type,
        disabled: b.disabled,
        className: b.className?.slice(0, 60)
      }));
    });
    console.log('Buttons:', JSON.stringify(buttons));
    
    // Find the "Create application" button (should be the last one in the Applications section)
    const createBtn = buttons.find(b => b.text?.includes('Create application') && b.type === 'submit');
    if (createBtn) {
      console.log('Clicking Create application button at index', createBtn.idx);
      await page.click(`button >> nth=${createBtn.idx}`);
      await page.waitForTimeout(10000);
      
      const afterUrl = page.url();
      const afterBody = await page.evaluate(() => document.body?.innerText || '');
      console.log('After create URL:', afterUrl);
      console.log('After create body:', afterBody.slice(0, 1500));
      
      // Check if application was created - look for credentials
      const codeElements = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('code, pre, [class*="key"], [class*="secret"], input[readonly]')).map(e => ({
          tag: e.tagName,
          text: (e.innerText || e.value || '').slice(0, 200),
          className: e.className?.slice(0, 50)
        })).filter(e => e.text);
      });
      console.log('Code/credential elements:', JSON.stringify(codeElements));
      
      // Look for client_id, client_secret patterns in full page
      const fullText = afterBody;
      console.log('Has client_id:', fullText.includes('client_id') || fullText.includes('Client ID'));
      console.log('Has client_secret:', fullText.includes('client_secret') || fullText.includes('Client Secret'));
      
    } else {
      console.log('No Create application submit button found');
      // Maybe the button text is different
      const allBtns = buttons.filter(b => b.text?.toLowerCase().includes('create'));
      console.log('Create buttons:', JSON.stringify(allBtns));
    }
    
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 500));
  }
  
  await browser.close();
}

main();
