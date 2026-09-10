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
  
  // Capture console and responses for debugging
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text().slice(0, 200));
  });
  page.on('response', (resp) => {
    if (resp.url().includes('oauth') || resp.url().includes('applications')) {
      console.log('RESP:', resp.status(), resp.url().slice(0, 150));
    }
  });
  
  try {
    const auth = JSON.parse(fs.readFileSync('/root/silent-giants/auth/gumroad.json', 'utf8'));
    await ctx.addCookies(auth.cookies);
    
    await page.goto('https://gumroad.com/settings/advanced', { timeout: 30000, waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    // Verify logged in
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
    console.log('Advanced body:', body.slice(0, 200));
    
    // Now navigate to the app edit page
    await page.goto('https://gumroad.com/oauth/applications/TguMFy_-5WRbPtMvm5HgIg==/edit', { timeout: 30000, waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    
    const url = page.url();
    console.log('Edit page URL:', url);
    const html = await page.content();
    console.log('HTML length:', html.length);
    console.log('HTML snippet:', html.slice(0, 500));
    
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    console.log('Body text:', bodyText.slice(0, 1500));
    
    // Get all inputs regardless of visibility
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input')).map(e => ({
        tag: e.tagName, type: e.type, id: e.id, name: e.name,
        value: e.value?.slice(0, 100), readonly: e.readOnly
      }));
    });
    console.log('\nInputs:', JSON.stringify(inputs, null, 2));
    
    if (bodyText.includes('Application ID')) {
      const idMatch = bodyText.match(/Application ID\s*\n?\s*([A-Za-z0-9._-]+)/);
      const secretMatch = bodyText.match(/Application Secret\s*\n?\s*([A-Za-z0-9._-]+)/);
      console.log('\nApplication ID:', idMatch?.[1]);
      console.log('Application Secret:', secretMatch?.[1]);
    }
    
    // Try clicking Generate access token
    const genBtn = await page.$('button:has-text("Generate access token")');
    if (genBtn) {
      console.log('\nFound Generate button! Clicking...');
      await genBtn.click();
      await page.waitForTimeout(8000);
      
      const afterBody = await page.evaluate(() => document.body?.innerText || '');
      console.log('\nAfter generate:', afterBody.slice(0, 2000));
      
      const newInputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(e => ({
          type: e.type, id: e.id, value: e.value?.slice(0, 100), readonly: e.readOnly
        }));
      });
      console.log('\nNew inputs:', JSON.stringify(newInputs));
      
      // Save everything
      fs.writeFileSync('/root/silent-giants/deliverables/keys/gumroad-app.json', JSON.stringify({
        appId: idMatch?.[1],
        appSecret: secretMatch?.[1],
        pageBody: afterBody.slice(0, 3000),
        inputs: newInputs
      }, null, 2));
    } else {
      console.log('\nNo Generate button found on page');
      // Dump all buttons
      const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.innerText?.trim()));
      console.log('Buttons:', JSON.stringify(buttons));
    }
    
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 500));
  }
  await browser.close();
}

main();
