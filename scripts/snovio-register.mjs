import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();

try {
  console.log('1. Going to Snov.io signup...');
  await page.goto('https://snov.io/register', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(5000);
  
  console.log('URL:', page.url());
  const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('Body:', body.replace(/\n+/g, ' | ').slice(0, 600));
  
  // Check for form
  const inputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input')].map(i => ({
      type: i.type, name: i.name, placeholder: i.placeholder, id: i.id, visible: i.offsetParent !== null
    })).filter(i => i.visible);
  });
  console.log('Inputs:', JSON.stringify(inputs));
  
  // Try to fill and submit
  if (inputs.length > 0) {
    const emailInput = inputs.find(i => i.type === 'email' || i.name.includes('email'));
    const nameInput = inputs.find(i => i.name.includes('name') && i.type === 'text');
    const passInput = inputs.find(i => i.type === 'password');
    
    if (emailInput) {
      const el = await page.$('input[name="' + emailInput.name + '"], input#' + emailInput.id + ', input[placeholder="' + emailInput.placeholder + '"]');
      if (el) await el.fill('Mohammadassia993@gmail.com');
    }
    if (nameInput) {
      const el = await page.$('input[name="' + nameInput.name + '"], input#' + nameInput.id + ', input[placeholder="' + nameInput.placeholder + '"]');
      if (el) await el.fill('Silent Giants');
    }
    if (passInput) {
      const el = await page.$('input[type="password"]');
      if (el) await el.fill('SilentGiants#2026');
    }
    
    await page.waitForTimeout(1000);
    console.log('2. Form filled, clicking submit...');
    
    const submitBtn = await page.$('button[type="submit"], button:has-text("Sign up"), button:has-text("Get started"), button:has-text("Create")');
    if (submitBtn) {
      const navPromise = page.waitForNavigation({ timeout: 15000 }).catch(() => null);
      await submitBtn.click();
      await navPromise;
      await page.waitForTimeout(5000);
      
      console.log('3. After submit URL:', page.url());
      const body2 = await page.evaluate(() => document.body.innerText.slice(0, 1500));
      console.log('4. Body:', body2.replace(/\n+/g, ' | ').slice(0, 500));
      
      // Save cookies
      const cookies = await ctx.cookies();
      fs.writeFileSync('/root/silent-giants/auth/snovio.json', JSON.stringify(cookies, null, 2));
      console.log('Cookies saved');
    }
  }
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 200));
} finally {
  await browser.close();
}
