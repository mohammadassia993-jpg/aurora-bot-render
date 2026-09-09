import { chromium } from 'playwright';
import fs from 'fs';

const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const EMAIL = 'Mohammadassia993@gmail.com';
const PASS = 'SilentGiants#2026';
const AUTH_DIR = '/root/silent-giants/auth';

async function tryRegister(url, name) {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    console.log('\n=== ' + name + ' ===');
    console.log('Loading:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(5000);
    
    const url2 = page.url();
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) || '');
    console.log('Final URL:', url2);
    console.log('Body preview:', body.replace(/\n+/g, ' | ').slice(0, 400));
    
    // Check for signup forms
    const forms = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')].map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder, id: i.id, visible: i.offsetParent !== null
      }));
      const buttons = [...document.querySelectorAll('button, a')].filter(b => {
        const t = (b.innerText || '').toLowerCase();
        return t.includes('sign') || t.includes('register') || t.includes('create') || t.includes('get started') || t.includes('start');
      }).map(b => ({ text: (b.innerText || '').trim().slice(0, 40), tag: b.tagName }));
      return { inputs: inputs.filter(i => i.visible), buttons };
    });
    console.log('Forms:', JSON.stringify(forms, null, 2));
    
    await browser.close();
    return { name, url: url2, forms };
  } catch (e) {
    console.log('Error:', e.message.slice(0, 100));
    await browser.close();
    return { name, error: e.message.slice(0, 100) };
  }
}

// Try multiple platforms
const platforms = [
  { url: 'https://getxapi.com', name: 'GetXAPI' },
  { url: 'https://algora.io', name: 'Algora' },
  { url: 'https://immunefi.com', name: 'Immunefi' },
  { url: 'https://payhip.com/register', name: 'Payhip' },
  { url: 'https://sellfy.com/signup/', name: 'Sellfy' },
];

for (const p of platforms) {
  await tryRegister(p.url, p.name);
}
