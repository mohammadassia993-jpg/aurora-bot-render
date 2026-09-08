import { chromium } from 'playwright';
import fs from 'node:fs';

async function saveGumroadSession() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome'
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Opening Gumroad signup...');
  await page.goto('https://app.gumroad.com/signup', { timeout: 20000 });
  await page.waitForTimeout(3000);
  
  // Fill and submit
  await page.locator('input[type="email"]').first().fill('auroraalmada4@gmail.com');
  await page.locator('input[type="password"]').first().fill('SilentGiants#2026');
  await page.locator('button[type="submit"]').filter({ hasText: 'Create account' }).click();
  await page.waitForTimeout(5000);
  
  console.log('URL:', page.url());
  
  // Save session
  const storageState = await context.storageState();
  fs.mkdirSync('auth', { recursive: true });
  fs.writeFileSync('auth/gumroad.json', JSON.stringify(storageState, null, 2));
  console.log('Session saved!');
  
  // Save cookies as backup
  const cookies = await context.cookies();
  fs.writeFileSync('auth/gumroad-cookies.json', JSON.stringify(cookies, null, 2));
  console.log('Cookies saved!');
  
  await browser.close();
}

saveGumroadSession().then(() => process.exit(0)).catch(e => { console.error(e.message.slice(0, 200)); process.exit(1); });
