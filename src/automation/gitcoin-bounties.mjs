import { chromium } from 'playwright';
import fs from 'node:fs';

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    proxy: { server: 'socks5://127.0.0.1:9050' }
  });
  const page = await browser.newPage();
  
  console.log('=== GITCOIN BOUNTIES VIA TOR ===');
  try {
    await page.goto('https://gitcoin.co/bounties', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    
    const body = await page.evaluate(() => document.body?.innerText || '');
    console.log('Body length:', body.length);
    console.log('First 500:', body.slice(0, 500));
    
    // Get all bounty links
    const bounties = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('a').forEach(a => {
        const href = a.href || '';
        const text = a.innerText?.trim() || '';
        if (href.includes('/bounties/') && text.length > 10 && !text.includes('Bounties')) {
          items.push({ title: text.slice(0, 100), url: href });
        }
      });
      return items.slice(0, 20);
    });
    console.log('\nBounties found:', bounties.length);
    bounties.forEach((b, i) => console.log(`  ${i+1}. ${b.title.slice(0, 60)} → ${b.url.slice(0, 80)}`));
    
    // Also try the grants page
    await page.goto('https://gitcoin.co/grants', { timeout: 20000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const grantsBody = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
    console.log('\nGrants page:', grantsBody.slice(0, 300));
    
  } catch (e) {
    console.log('Error:', e.message.slice(0, 200));
  }
  
  await browser.close();
}

main();
