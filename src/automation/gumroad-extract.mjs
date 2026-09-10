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
    
    // Go directly to the app edit page
    await page.goto('https://gumroad.com/oauth/applications/TguMFy_-5WRbPtMvm5HgIg==/edit', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    const body = await page.evaluate(() => document.body?.innerText || '');
    console.log('Page body:', body.slice(0, 2000));
    
    // Extract all inputs and text fields
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, textarea, code, pre')).map(e => ({
        tag: e.tagName, type: e.type, id: e.id, name: e.name,
        value: e.value?.slice(0, 100),
        text: e.innerText?.slice(0, 100),
        readonly: e.readOnly,
        visible: e.offsetParent !== null
      }));
    });
    console.log('\nAll inputs:', JSON.stringify(inputs, null, 2));
    
    // Look for Application ID, Secret, and access token
    const idMatch = body.match(/Application ID\s*\n?\s*([A-Za-z0-9._-]+)/);
    const secretMatch = body.match(/Application Secret\s*\n?\s*([A-Za-z0-9._-]+)/);
    const tokenMatch = body.match(/access token\s*\n?\s*([A-Za-z0-9._-]+)/i);
    
    if (idMatch) console.log('\nApplication ID:', idMatch[1]);
    if (secretMatch) console.log('Application Secret:', secretMatch[1]);
    if (tokenMatch) console.log('Access Token:', tokenMatch[1]);
    
    // Click "Generate access token"
    const genBtn = await page.$('button:has-text("Generate access token")');
    if (genBtn) {
      console.log('\nClicking Generate access token...');
      await genBtn.click();
      await page.waitForTimeout(5000);
      
      const afterBody = await page.evaluate(() => document.body?.innerText || '');
      console.log('\nAfter generate body:', afterBody.slice(0, 2000));
      
      // Look for the access token
      const newTokenMatch = afterBody.match(/access[_ ]?token[:\s"']*\n?\s*([A-Za-z0-9._-]{20,})/i);
      if (newTokenMatch) {
        console.log('\nACCESS TOKEN FOUND:', newTokenMatch[1]);
      }
      
      // Check for code/pre elements
      const codeElements = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('code, pre, input[readonly], [class*="token"], [class*="key"]')).map(e => ({
          tag: e.tagName,
          text: (e.innerText || e.value || '').slice(0, 200),
          className: e.className?.slice(0, 50)
        })).filter(e => e.text && e.text.length > 5);
      });
      console.log('\nCode elements:', JSON.stringify(codeElements, null, 2));
      
      // Check for any element containing a long token-like string
      const allElements = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('*')).filter(e => {
          const text = e.innerText || e.value || '';
          return text.length > 20 && text.length < 200 && /^[A-Za-z0-9._-]+$/.test(text);
        }).map(e => ({
          tag: e.tagName, text: (e.innerText || e.value || '').slice(0, 100),
          className: e.className?.slice(0, 50)
        }));
      });
      console.log('\nToken-like elements:', JSON.stringify(allElements.slice(0, 20), null, 2));
    } else {
      console.log('\nNo Generate access token button found');
    }
    
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 500));
  }
  await browser.close();
}

main();
