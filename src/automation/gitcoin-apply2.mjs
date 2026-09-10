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
  
  console.log('=== GITCOIN BOUNTIES ===');
  try {
    // Try the bounties explorer page
    await page.goto('https://gitcoin.co/bounties/explorer', { timeout: 30000, waitUntil: 'networkidle' });
    await page.waitForTimeout(10000);
    
    const body = await page.evaluate(() => document.body?.innerText || '');
    console.log('Body length:', body.length);
    console.log('First 500:', body.slice(0, 500));
    
    // Get all links
    const allLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(a => ({
        text: a.innerText?.trim().slice(0, 80),
        href: a.href
      })).filter(l => l.text.length > 3).slice(0, 30);
    });
    console.log('\nAll links:', JSON.stringify(allLinks, null, 2));
    
    // Also try the grants page
    await page.goto('https://gitcoin.co/grants', { timeout: 30000, waitUntil: 'networkidle' });
    await page.waitForTimeout(8000);
    const grantsBody = await page.evaluate(() => document.body?.innerText?.slice(0, 1000) || '');
    console.log('\nGrants page:', grantsBody.slice(0, 500));
    
  } catch (e) {
    console.log('Error:', e.message.slice(0, 200));
  }
  
  await browser.close();
}

main();
