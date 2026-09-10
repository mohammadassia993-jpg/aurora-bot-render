import { chromium } from 'playwright';

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  
  console.log('=== IMMUNEFI BUG BOUNTY PROGRAMS ===');
  try {
    await page.goto('https://immunefi.com/bug-bounty-program/', { timeout: 30000, waitUntil: 'networkidle' });
    await page.waitForTimeout(10000);
    
    const body = await page.evaluate(() => document.body?.innerText || '');
    console.log('Body length:', body.length);
    console.log('Content:', body.slice(0, 1500));
    
    // Get all bounty program links
    const programs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).filter(a => {
        const text = a.innerText?.trim() || '';
        return text.length > 5 && !text.includes('Platform') && !text.includes('Join');
      }).map(a => ({ text: a.innerText?.trim().slice(0, 100), href: a.href })).slice(0, 30);
    });
    console.log('\nPrograms:', JSON.stringify(programs, null, 2));
    
  } catch (e) {
    console.log('Error:', e.message.slice(0, 200));
  }
  
  await browser.close();
}

main();
