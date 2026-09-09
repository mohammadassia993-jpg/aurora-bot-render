import { chromium } from 'playwright';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage();

try {
  await page.goto('https://bugs.immunefi.com/signup', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // Fill form fields
  await page.fill('input[placeholder="Username"]', 'silentgiants');
  await page.fill('input[type="email"]', 'Mohammadassia993@gmail.com');
  
  const passInputs = await page.$$('input[type="password"]');
  if (passInputs.length >= 2) {
    await passInputs[0].fill('SilentGiants#2026');
    await passInputs[1].fill('SilentGiants#2026');
  }
  
  console.log('Form filled. Checking for CAPTCHA or errors...');
  
  // Check for captcha
  const hasCaptcha = await page.evaluate(() => {
    const iframes = [...document.querySelectorAll('iframe')].map(f => f.src);
    const captchaElements = [...document.querySelectorAll('[class*="captcha"], [class*="recaptcha"], [id*="captcha"]')];
    return { iframes, captchaCount: captchaElements.length };
  });
  console.log('CAPTCHA check:', JSON.stringify(hasCaptcha));
  
  // Click signup and listen for navigation
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('signup') || r.url().includes('login') || r.url().includes('dashboard'), { timeout: 10000 }).catch(() => null),
    page.click('button:has-text("Sign-up")').catch(e => console.log('Click error:', e.message))
  ]);
  
  if (response) {
    console.log('Response URL:', response.url(), 'Status:', response.status());
  }
  
  await page.waitForTimeout(3000);
  console.log('Final URL:', page.url());
  const body = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  console.log('Body:', body.replace(/\n+/g, ' | ').slice(0, 500));
  
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 200));
} finally {
  await browser.close();
}
