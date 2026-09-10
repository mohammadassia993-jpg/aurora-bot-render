import { chromium } from 'playwright';

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    proxy: { server: 'socks5://127.0.0.1:9050' }
  });
  const page = await browser.newPage();
  
  console.log('=== SUPERTEAM VIA TOR ===');
  try {
    await page.goto('https://earn.superteam.io/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 1000) || '');
    console.log('Body length:', body.length);
    console.log('Body:', body.slice(0, 500));
    
    // Get bounty links
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).filter(a => {
        const href = a.href || '';
        return href.includes('bount') || href.includes('listing');
      }).map(a => ({ text: a.innerText?.trim().slice(0, 80), href: a.href })).slice(0, 20);
    });
    console.log('\nLinks:', JSON.stringify(links, null, 2));
  } catch (e) {
    console.log('Error:', e.message.slice(0, 200));
  }
  
  console.log('\n=== GITCOIN VIA TOR ===');
  try {
    await page.goto('https://gitcoin.co/bounties', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 1000) || '');
    console.log('Body length:', body.length);
    console.log('Body:', body.slice(0, 500));
    
    // Get bounty items
    const items = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="bounty"]')).map(a => ({
        text: a.innerText?.trim().slice(0, 80),
        href: a.href
      })).filter(i => i.text.length > 5).slice(0, 20);
    });
    console.log('\nBounty items:', JSON.stringify(items, null, 2));
  } catch (e) {
    console.log('Error:', e.message.slice(0, 200));
  }
  
  await browser.close();
}

main();
