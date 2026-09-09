import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const EMAIL = 'auroraalmada4@gmail.com';
const PASS = 'SilentGiants#2026';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'en-US'
});
const page = await ctx.newPage();

try {
  // Step 1: Go to platform.kimi.com
  console.log('1. Opening platform.kimi.com...');
  await page.goto('https://platform.kimi.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());
  
  // Take screenshot
  await page.screenshot({ path: '/tmp/kimi-step1.png' });
  
  // Find signup/login buttons
  const buttons = await page.evaluate(() => {
    return [...document.querySelectorAll('a, button')].map(e => ({
      text: (e.innerText || '').trim().slice(0, 50),
      href: e.href || '',
      tag: e.tagName
    })).filter(b => b.text.length > 0 && b.text.length < 50).slice(0, 20);
  });
  console.log('Buttons:', JSON.stringify(buttons, null, 2));
  
  // Look for signup/register links
  const signupLink = buttons.find(b => 
    b.text.includes('注册') || b.text.includes('登录') || 
    b.text.includes('Sign') || b.text.includes('Register') ||
    b.text.includes('开始') || b.text.includes('用户中心')
  );
  
  if (signupLink) {
    console.log('\n2. Found signup link:', signupLink.text, signupLink.href);
    if (signupLink.href && signupLink.href !== page.url()) {
      await page.goto(signupLink.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } else {
      await page.click('text=' + signupLink.text);
    }
    await page.waitForTimeout(3000);
    console.log('After click URL:', page.url());
    await page.screenshot({ path: '/tmp/kimi-step2.png' });
  }
  
  // Check what's on the page now
  const body = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('\nPage content:', body.replace(/\n+/g, ' | ').slice(0, 800));
  
  // Look for form inputs
  const inputs = await page.evaluate(() => {
    return [...document.querySelectorAll('input')].map(i => ({
      type: i.type, name: i.name, placeholder: i.placeholder, id: i.id, 
      visible: i.offsetParent !== null
    })).filter(i => i.visible);
  });
  console.log('\nInputs:', JSON.stringify(inputs, null, 2));
  
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 300));
  await page.screenshot({ path: '/tmp/kimi-error.png' });
} finally {
  await browser.close();
}
