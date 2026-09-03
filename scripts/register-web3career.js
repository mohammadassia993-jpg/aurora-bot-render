#!/usr/bin/env node
/**
 * Register on web3.career via Puppeteer (email-based, no OAuth needed)
 */
import puppeteer from 'puppeteer';

const EMAIL = 'silentgiants-team@emalupe.com';
const PASSWORD = 'SgBot2026!x';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

(async () => {
  log('🚀 Registering on web3.career...');
  
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

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // Navigate to signup page
    log('📄 Navigating to signup...');
    await page.goto('https://web3.career/users/sign_up', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    log(`📍 URL: ${page.url()}`);

    // Fill email
    const emailInput = await page.$('input[type="email"], input[name="user[email]"]');
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(EMAIL, { delay: 30 });
      log('📧 Email entered');
    } else {
      log('❌ Email input not found');
      const text = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
      log(`📄 Page: ${text.slice(0, 200)}`);
      await browser.close();
      process.exit(1);
    }

    // Check the TOS checkbox
    try {
      const checkbox = await page.$('input[type="checkbox"]');
      if (checkbox) {
        await checkbox.click();
        log('☑️ TOS accepted');
      }
    } catch (e) {
      log(`⚠️ TOS checkbox: ${e.message}`);
    }

    // Wait for Turnstile
    log('⏳ Waiting for Turnstile...');
    await new Promise(r => setTimeout(r, 5000));

    // Click submit
    const submitted = await page.evaluate(() => {
      const btn = document.querySelector('input[type="submit"][value="Sign up"], button[type="submit"]');
      if (btn) { btn.click(); return true; }
      return false;
    });
    
    if (submitted) {
      log('👉 Submit clicked');
      await new Promise(r => setTimeout(r, 8000));
      log(`📍 After submit: ${page.url()}`);
      
      const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
      log(`📄 Response: ${pageText.slice(0, 300).replace(/\n/g, ' ')}`);
    } else {
      log('❌ Submit button not found');
    }

  } catch (e) {
    log(`❌ Error: ${e.message}`);
  }

  await browser.close();
  log('\n✅ Registration attempt complete');
})();
