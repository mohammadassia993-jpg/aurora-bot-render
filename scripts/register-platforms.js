#!/usr/bin/env node
/**
 * Attempt to register on crypto job platforms via Puppeteer
 * Runs on Render (x86_64 with Chrome)
 */
import puppeteer from 'puppeteer';

const PLATFORMS = [
  {
    name: 'CryptoJobsList',
    url: 'https://cryptojobslist.com',
    registerUrl: 'https://cryptojobslist.com/signup',
    email: 'silentgiants-team@emalupe.com',
    password: 'SgBot2026!x'
  },
  {
    name: 'Web3.career',
    url: 'https://web3.career',
    registerUrl: 'https://web3.career/auth/signup',
    email: 'silentgiants-team@emalupe.com',
    password: 'SgBot2026!x'
  }
];

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

(async () => {
  log('🚀 Starting platform registration...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      timeout: 30000
    });
    log('✅ Browser launched');
  } catch (e) {
    log(`❌ Browser failed: ${e.message}`);
    process.exit(1);
  }

  for (const platform of PLATFORMS) {
    log(`\n📋 Registering on ${platform.name}...`);
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    
    try {
      await page.goto(platform.registerUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 5000));
      
      const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
      log(`  📍 URL: ${page.url()}`);
      log(`  📄 Page: ${pageText.slice(0, 100).replace(/\n/g, ' ')}`);
      
      // Try to find and fill registration form
      const emailInput = await page.$('input[type="email"], input[name="email"]');
      const passInput = await page.$('input[type="password"], input[name="password"]');
      
      if (emailInput && passInput) {
        await emailInput.click({ clickCount: 3 });
        await emailInput.type(platform.email, { delay: 30 });
        await passInput.click({ clickCount: 3 });
        await passInput.type(platform.password, { delay: 30 });
        log('  📧 Credentials entered');
        
        // Click submit
        const submitted = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
          for (const btn of btns) {
            const txt = (btn.textContent || btn.value || '').toLowerCase();
            if (txt.includes('sign up') || txt.includes('register') || txt.includes('create') || txt.includes('submit')) {
              btn.click();
              return true;
            }
          }
          return false;
        });
        
        if (submitted) {
          log('  👉 Submit clicked');
          await new Promise(r => setTimeout(r, 5000));
          log(`  📍 After submit: ${page.url()}`);
        } else {
          log('  ⚠️ Submit button not found');
        }
      } else {
        log('  ⚠️ Registration form not found (may need OAuth)');
      }
    } catch (e) {
      log(`  ❌ Error: ${e.message}`);
    }
    
    await page.close();
    await new Promise(r => setTimeout(r, 2000));
  }

  await browser.close();
  log('\n✅ Registration attempts complete');
})();
