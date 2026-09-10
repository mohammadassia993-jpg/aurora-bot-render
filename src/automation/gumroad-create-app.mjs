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
    // Load cookies
    const auth = JSON.parse(fs.readFileSync('/root/silent-giants/auth/gumroad.json', 'utf8'));
    await ctx.addCookies(auth.cookies);
    
    // Go to advanced settings
    await page.goto('https://gumroad.com/settings/advanced', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // First check if there's a personal access token section (maybe hidden behind a button)
    // Try direct API token URL
    await page.goto('https://gumroad.com/l/api', { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    let body = await page.evaluate(() => document.body?.innerText || '');
    console.log('/l/api:', body.slice(0, 500));
    
    // Go back to advanced
    await page.goto('https://gumroad.com/settings/advanced', { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Try to create an OAuth application
    // Look for the create application form
    const appInputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, textarea')).map(i => ({
        tag: i.tagName, type: i.type, name: i.name, placeholder: i.placeholder,
        id: i.id, value: i.value?.slice(0, 30),
        visible: i.offsetParent !== null
      }));
    });
    console.log('Form inputs:', JSON.stringify(appInputs, null, 2));
    
    // Look for "Application name" and "Redirect URI" inputs
    const nameInput = appInputs.find(i => i.name === 'name' || i.placeholder?.toLowerCase().includes('name'));
    const redirectInput = appInputs.find(i => i.name === 'redirect_uri' || i.name === 'redirect' || i.placeholder?.toLowerCase().includes('redirect'));
    
    if (nameInput) {
      console.log('Found name input:', nameInput);
      const selector = nameInput.id ? `#${nameInput.id}` : `input[name="${nameInput.name}"]`;
      await page.fill(selector, 'Silent Giants API');
      console.log('Filled name');
    } else {
      console.log('No name input found, trying to find by visible labels...');
      // Try filling by order
      const visibleInputs = appInputs.filter(i => i.visible);
      console.log('Visible inputs:', JSON.stringify(visibleInputs));
    }
    
    if (redirectInput) {
      console.log('Found redirect input:', redirectInput);
      const selector = redirectInput.id ? `#${redirectInput.id}` : `input[name="${redirectInput.name}"]`;
      await page.fill(selector, 'https://silent-giants.onrender.com/callback');
      console.log('Filled redirect URI');
    }
    
    // Click Create application button
    const createBtn = await page.$('button:has-text("Create application"), input[type="submit"]');
    if (createBtn) {
      console.log('Clicking Create application...');
      await createBtn.click();
      await page.waitForTimeout(8000);
      const afterBody = await page.evaluate(() => document.body?.innerText || '');
      const afterUrl = page.url();
      console.log('After create:', afterUrl);
      console.log('Body:', afterBody.slice(0, 800));
      
      // Look for client_id and client_secret
      const keyPatterns = {
        client_id: afterBody.match(/client[_ ]?id[:\s]*["']?([A-Za-z0-9._-]+)/i),
        client_secret: afterBody.match(/client[_ ]?secret[:\s]*["']?([A-Za-z0-9._-]+)/i),
        token: afterBody.match(/token[:\s]*["']?([A-Za-z0-9._-]{20,})/i),
      };
      console.log('Key patterns:', JSON.stringify(keyPatterns));
      
      // Also check for code elements
      const codeElements = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('code, pre, .code, [class*="key"], [class*="secret"], input[readonly], .token')).map(e => ({
          tag: e.tagName,
          text: e.innerText?.slice(0, 100),
          value: e.value?.slice(0, 100),
        }));
      });
      console.log('Code elements:', JSON.stringify(codeElements));
    } else {
      console.log('No Create button found');
      // Dump all buttons
      const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button, input[type="submit"]')).map(b => ({
        text: b.innerText?.trim() || b.value,
        type: b.type,
        disabled: b.disabled
      })));
      console.log('Buttons:', JSON.stringify(buttons));
    }
    
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 300));
  }
  
  await browser.close();
}

main();
