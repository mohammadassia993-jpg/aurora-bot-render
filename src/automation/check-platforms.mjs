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
  
  const platforms = [
    { name: 'Gitcoin Campaigns', url: 'https://gitcoin.co/campaigns' },
    { name: 'Algora', url: 'https://console.algora.io/bounties' },
    { name: 'Dework', url: 'https://dework.xyz/bounties' },
    { name: 'BountyCaster', url: 'https://www.bountycaster.xyz/' },
  ];
  
  for (const p of platforms) {
    console.log(`\n=== ${p.name} ===`);
    try {
      await page.goto(p.url, { timeout: 20000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      const body = await page.evaluate(() => document.body?.innerText?.slice(0, 800) || '');
      console.log('Body length:', body.length);
      console.log('Content:', body.slice(0, 400));
      
      // Get bounty items
      const items = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).filter(a => {
          const text = a.innerText?.trim() || '';
          return text.length > 10 && (a.href.includes('bounty') || a.href.includes('issue') || a.href.includes('grant'));
        }).map(a => ({ text: a.innerText?.trim().slice(0, 80), href: a.href })).slice(0, 10);
      });
      if (items.length > 0) {
        console.log('Items:', JSON.stringify(items, null, 2));
      }
    } catch (e) {
      console.log('Error:', e.message.slice(0, 150));
    }
  }
  
  await browser.close();
}

main();
