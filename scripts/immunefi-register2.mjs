import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();

try {
  console.log('1. Going to Immunefi signup...');
  await page.goto('https://bugs.immunefi.com/signup', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(3000);
  
  // Fill the form
  const usernameInput = await page.$('input[name="username"], input[placeholder*="Username"]');
  const emailInput = await page.$('input[type="email"], input[name="email"]');
  const passwordInput = await page.$('input[type="password"]');
  const passwordConfirmInputs = await page.$$('input[type="password"]');
  
  console.log('Inputs found:', {
    username: !!usernameInput,
    email: !!emailInput,
    passwords: passwordConfirmInputs.length
  });
  
  if (usernameInput) await usernameInput.fill('silentgiants');
  if (emailInput) await emailInput.fill('Mohammadassia993@gmail.com');
  if (passwordConfirmInputs[0]) await passwordConfirmInputs[0].fill('SilentGiants#2026');
  if (passwordConfirmInputs[1]) await passwordConfirmInputs[1].fill('SilentGiants#2026');
  
  await page.waitForTimeout(1000);
  console.log('2. Form filled');
  
  // Click signup button
  const signupBtn = await page.$('button:has-text("Sign-up"), button[type="submit"]');
  if (signupBtn) {
    console.log('3. Clicking Sign-up...');
    await signupBtn.click();
    await page.waitForTimeout(5000);
    
    const newUrl = page.url();
    const body = await page.evaluate(() => document.body.innerText.slice(0, 1500));
    console.log('4. URL after:', newUrl);
    console.log('5. Body:', body.replace(/\n+/g, ' | ').slice(0, 500));
    
    // Save cookies
    const cookies = await ctx.cookies();
    fs.writeFileSync('/root/silent-giants/auth/immunefi.json', JSON.stringify(cookies, null, 2));
    console.log('Cookies saved');
  } else {
    console.log('No signup button found');
    // List all buttons
    const allBtns = await page.evaluate(() => {
      return [...document.querySelectorAll('button, input[type="submit"], a')].map(b => ({
        text: (b.innerText || b.value || '').trim().slice(0, 40),
        tag: b.tagName,
        visible: b.offsetParent !== null
      })).filter(b => b.visible);
    });
    console.log('All buttons:', JSON.stringify(allBtns));
  }
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 300));
} finally {
  await browser.close();
}
