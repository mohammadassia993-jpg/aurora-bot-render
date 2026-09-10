import { chromium } from 'playwright';
import fs from 'node:fs';

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  
  console.log('=== IMMUNEFI BUG BOUNTIES ===');
  try {
    await page.goto('https://immunefi.com/bounties/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) || '');
    console.log('Body length:', body.length);
    console.log('Content:', body.slice(0, 800));
    
    // Get bounty links
    const bounties = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).filter(a => {
        const href = a.href || '';
        return href.includes('bounty') && a.innerText?.trim().length > 5;
      }).map(a => ({ text: a.innerText?.trim().slice(0, 100), href: a.href })).slice(0, 20);
    });
    console.log('\nBounties:', JSON.stringify(bounties, null, 2));
    
  } catch (e) {
    console.log('Error:', e.message.slice(0, 200));
  }
  
  // Also check Immunefi's active programs
  console.log('\n=== IMMUNEFI PROGRAMS ===');
  try {
    await page.goto('https://immunefi.com/bug-bounty/', { timeout: 20000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 1500) || '');
    console.log('Body:', body.slice(0, 600));
  } catch (e) {
    console.log('Error:', e.message.slice(0, 200));
  }
  
  await browser.close();
}

main();
