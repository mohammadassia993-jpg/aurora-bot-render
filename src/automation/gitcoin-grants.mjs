import { chromium } from 'playwright';

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  
  console.log('=== GITCOIN GRANTS 24 ===');
  try {
    await page.goto('https://gitcoin.co/campaigns/gitcoin-grants-24-gg24', { timeout: 30000, waitUntil: 'networkidle' });
    await page.waitForTimeout(8000);
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 1500) || '');
    console.log('Body:', body.slice(0, 800));
    
    // Get all links
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).filter(a => {
        const text = a.innerText?.trim() || '';
        return text.length > 5 && !text.includes('Gitcoin') && !text.includes('About');
      }).map(a => ({ text: a.innerText?.trim().slice(0, 80), href: a.href })).slice(0, 20);
    });
    console.log('\nLinks:', JSON.stringify(links, null, 2));
    
  } catch (e) {
    console.log('Error:', e.message.slice(0, 200));
  }
  
  // Also check the submit/contribute page
  console.log('\n=== GITCOIN SUBMIT ===');
  try {
    await page.goto('https://gitcoin.co/submit', { timeout: 20000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 800) || '');
    console.log('Body:', body.slice(0, 500));
  } catch (e) {
    console.log('Error:', e.message.slice(0, 200));
  }
  
  await browser.close();
}

main();
