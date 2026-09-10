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
  
  // Search Superteam Earn
  console.log('=== SUPERTEAM EARN ===');
  await page.goto('https://earn.superteam.com/', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const body = await page.evaluate(() => document.body?.innerText || '');
  console.log('Page body (first 500):', body.slice(0, 500));
  
  // Look for bounty/opportunity listings
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).filter(a => {
      const href = a.href || '';
      return href.includes('bounty') || href.includes('opportunity') || href.includes('listing');
    }).map(a => ({ text: a.innerText?.trim().slice(0, 100), href: a.href })).slice(0, 20);
  });
  console.log('\nBounty links:', JSON.stringify(links, null, 2));
  
  // Search for specific content
  const searchUrl = 'https://earn.superteam.com/?search=content+writer';
  await page.goto(searchUrl, { timeout: 20000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const searchBody = await page.evaluate(() => document.body?.innerText?.slice(0, 1000) || '');
  console.log('\nSearch results:', searchBody.slice(0, 500));
  
  // Also check Algora
  console.log('\n=== ALGORA ===');
  await page.goto('https://console.algora.io/bounties', { timeout: 20000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const algoraBody = await page.evaluate(() => document.body?.innerText?.slice(0, 1000) || '');
  console.log('Algora body:', algoraBody.slice(0, 500));
  
  await browser.close();
}

main();
