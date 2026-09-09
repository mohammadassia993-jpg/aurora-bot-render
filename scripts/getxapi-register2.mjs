import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();

try {
  console.log('1. Going to GetXAPI signup...');
  // Go to homepage, find signup href
  await page.goto('https://www.getxapi.com/', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(2000);
  
  const signupHref = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find(x => (x.innerText || '').toLowerCase().includes('signup'));
    return a ? a.href : null;
  });
  console.log('Signup link:', signupHref);
  
  if (signupHref) {
    await page.goto(signupHref, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(3000);
    console.log('2. Signup URL:', page.url());
    
    const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log('3. Body:', body.replace(/\n+/g, ' | ').slice(0, 600));
    
    // Look for form
    const inputs = await page.evaluate(() => {
      return [...document.querySelectorAll('input')].map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder, id: i.id, visible: i.offsetParent !== null
      }));
    });
    console.log('Inputs:', JSON.stringify(inputs.filter(i => i.visible)));
  }
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 200));
} finally {
  await browser.close();
}
