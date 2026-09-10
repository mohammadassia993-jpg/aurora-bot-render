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
  
  // Capture ALL responses
  const responses = [];
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('gumroad') && !url.includes('cdn-cgi') && !url.includes('google')) {
      const status = resp.status();
      let body = '';
      try { body = (await resp.text()).slice(0, 500); } catch(e) {}
      responses.push({ url: url.slice(0, 200), status, body: body.slice(0, 200) });
    }
  });
  
  try {
    const auth = JSON.parse(fs.readFileSync('/root/silent-giants/auth/gumroad.json', 'utf8'));
    await ctx.addCookies(auth.cookies);
    
    // First check /l/api with cookies
    await page.goto('https://gumroad.com/l/api', { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const apiPage = page.url();
    const apiBody = await page.evaluate(() => document.body?.innerText || '');
    console.log('/l/api URL:', apiPage);
    console.log('/l/api Body:', apiBody.slice(0, 500));
    
    // Now go to advanced settings and create the app
    await page.goto('https://gumroad.com/settings/advanced', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Fill the application form using proper escaping for Playwright CSS selectors
    // The IDs contain colons which need escaping
    const nameInput = await page.$('[id*="-name"]');
    const redirectInput = await page.$('[id*="-redirectUri"]');
    
    if (nameInput) {
      await nameInput.fill('SilentGiantsBot');
      console.log('Filled app name');
    } else {
      console.log('Trying alternative selector for name...');
      // Try by placeholder or position
      const inputs = await page.$$('input[type="text"]');
      if (inputs.length > 0) {
        // Skip first few inputs (domain, etc.) and find the one for app name
        for (const inp of inputs) {
          const placeholder = await inp.evaluate(el => el.placeholder);
          const id = await inp.evaluate(el => el.id);
          console.log(`Input: id=${id}, placeholder=${placeholder}`);
          if (id.includes('name') || id.includes('-name')) {
            await inp.fill('SilentGiantsBot');
            console.log('Filled via alternative selector');
            break;
          }
        }
      }
    }
    
    if (redirectInput) {
      await redirectInput.fill('https://silent-giants.onrender.com/callback');
      console.log('Filled redirect URI');
    }
    
    await page.waitForTimeout(1000);
    
    // Click the Create application button
    // It's the one inside the Applications section
    const createBtn = await page.$$('button');
    for (const btn of createBtn) {
      const text = await btn.evaluate(el => el.innerText?.trim());
      if (text === 'Create application') {
        console.log('Found Create application button, clicking...');
        await btn.click();
        break;
      }
    }
    
    await page.waitForTimeout(8000);
    
    // Check for results
    const afterUrl = page.url();
    const afterBody = await page.evaluate(() => document.body?.innerText || '');
    console.log('\nAfter create URL:', afterUrl);
    console.log('After create body:', afterBody.slice(0, 1500));
    
    // Check network responses
    console.log('\nNetwork responses:');
    for (const r of responses.slice(-10)) {
      console.log(`  ${r.url} [${r.status}] ${r.body.slice(0, 100)}`);
    }
    
    // Look for any newly created app credentials
    const allText = afterBody;
    const keyMatch = allText.match(/client[_-]id[:\s"']*\n?\s*([A-Za-z0-9._-]+)/i) ||
                     allText.match(/API[_\s]*key[:\s"']*\n?\s*([A-Za-z0-9._-]+)/i) ||
                     allText.match(/secret[:\s"']*\n?\s*([A-Za-z0-9._-]{20,})/i);
    if (keyMatch) {
      console.log('KEY FOUND:', keyMatch[1]);
    }
    
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 500));
  }
  await browser.close();
}

main();
