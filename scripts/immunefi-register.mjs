import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext();
const page = await ctx.newPage();

try {
  console.log('1. Going to Immunefi signup...');
  await page.goto('https://immunefi.com', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(3000);
  
  // Look for signup/join links
  const signupLinks = await page.evaluate(() => {
    return [...document.querySelectorAll('a')].filter(a => {
      const t = (a.innerText || '').toLowerCase();
      const h = (a.href || '').toLowerCase();
      return t.includes('join') || t.includes('sign') || t.includes('register') || h.includes('join') || h.includes('signup') || h.includes('register');
    }).map(a => ({ text: a.innerText.trim().slice(0, 40), href: a.href })).slice(0, 10);
  });
  console.log('Signup links:', JSON.stringify(signupLinks, null, 2));
  
  // Try the researcher signup
  if (signupLinks.length > 0) {
    const link = signupLinks.find(l => l.href.includes('join') || l.href.includes('signup') || l.href.includes('register'));
    if (link) {
      console.log('2. Navigating to:', link.href);
      await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(3000);
      
      const body = await page.evaluate(() => document.body.innerText.slice(0, 1500));
      console.log('3. Body:', body.replace(/\n+/g, ' | ').slice(0, 500));
      
      // Check for GitHub OAuth
      const githubLinks = await page.evaluate(() => {
        return [...document.querySelectorAll('a, button')].filter(e => {
          return (e.innerText || '').toLowerCase().includes('github');
        }).map(e => ({ text: e.innerText.trim(), href: e.href || '' }));
      });
      console.log('GitHub links:', JSON.stringify(githubLinks));
    }
  }
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 200));
} finally {
  await browser.close();
}
