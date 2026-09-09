import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
});
const page = await context.newPage();

try {
  console.log('1. Going to GetXAPI...');
  await page.goto('https://getxapi.com', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  const url = page.url();
  const body = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log('URL:', url);
  console.log('Body:', body.replace(/\n+/g, ' | ').slice(0, 1000));
  
  // Look for signup/register buttons
  const links = await page.evaluate(() => {
    return [...document.querySelectorAll('a, button')].map(e => ({
      text: (e.innerText || '').trim().slice(0, 60),
      href: e.href || '',
      tag: e.tagName
    })).filter(x => x.text.length > 0 && x.text.length < 60).slice(0, 30);
  });
  console.log('\nLinks/Buttons:', JSON.stringify(links, null, 2));
  
} catch (e) {
  console.log('ERROR:', e.message);
} finally {
  await browser.close();
}
