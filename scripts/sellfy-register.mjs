import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();

try {
  console.log('1. Opening Sellfy signup...');
  await page.goto('https://sellfy.com/auth/signup/', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(3000);
  
  console.log('URL:', page.url());
  
  // Fill the form
  await page.fill('input[name="first_name"]', 'Silent Giants');
  await page.fill('input[name="email"]', 'Mohammadassia993@gmail.com');
  await page.fill('input[name="password"]', 'SilentGiants#2026');
  await page.waitForTimeout(1000);
  
  console.log('2. Form filled, looking for submit...');
  const allButtons = await page.evaluate(() => {
    return [...document.querySelectorAll('button, input[type="submit"], a')].map(b => ({
      text: (b.innerText || b.value || '').trim().slice(0, 50),
      tag: b.tagName,
      type: b.type,
      visible: b.offsetParent !== null
    })).filter(b => b.visible && (b.text.includes('Next') || b.text.includes('Sign') || b.text.includes('Create') || b.text.includes('Submit')));
  });
  console.log('Buttons:', JSON.stringify(allButtons));
  
  // Click Next
  const nextBtn = await page.$('button:has-text("Next"), button:has-text("Sign up"), button:has-text("Create")');
  if (nextBtn) {
    console.log('3. Clicking submit...');
    await nextBtn.click();
    await page.waitForTimeout(5000);
    console.log('4. After click URL:', page.url());
    const body = await page.evaluate(() => document.body.innerText.slice(0, 1000));
    console.log('5. Body:', body.replace(/\n+/g, ' | ').slice(0, 500));
    
    // Save cookies for later use
    const cookies = await ctx.cookies();
    fs.writeFileSync('/root/silent-giants/auth/sellfy.json', JSON.stringify(cookies, null, 2));
    console.log('Cookies saved to auth/sellfy.json');
  } else {
    console.log('No submit button found');
  }
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 200));
} finally {
  await browser.close();
}
