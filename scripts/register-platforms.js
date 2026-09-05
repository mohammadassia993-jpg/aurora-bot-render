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
  log('🚀 Starting platform registrations...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
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

  // === web3.career (email registration) ===
  log('\n📋 Registering on web3.career...');
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });
  
  try {
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
      const text = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
      log(`📄 Page: ${text.slice(0, 200)}`);
    }

    // Check TOS
    try {
      const checkbox = await page.$('input[type="checkbox"]');
      if (checkbox) { await checkbox.click(); log('☑️ TOS accepted'); }
    } catch {}

    // Wait for Turnstile
    await new Promise(r => setTimeout(r, 5000));

    // Submit
    const submitted = await page.evaluate(() => {
      const btn = document.querySelector('input[type="submit"], button[type="submit"]');
      if (btn) { btn.click(); return true; }
      return false;
    });
    
    if (submitted) {
      log('👉 Submit clicked');
      await new Promise(r => setTimeout(r, 8000));
      log(`📍 After: ${page.url()}`);
      const txt = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
      log(`📄 ${txt.slice(0, 200).replace(/\n/g, ' ')}`);
    }
  } catch (e) {
    log(`❌ Error: ${e.message}`);
  }
  await page.close();

  // === Try crypto.jobs ===
  log('\n📋 Checking crypto.jobs...');
  const page2 = await browser.newPage();
  await page2.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  try {
    await page2.goto('https://crypto.jobs', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));
    const links = await page2.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).filter(a => 
        /sign|register|join|create/i.test(a.textContent + a.href)
      ).map(a => ({ text: a.textContent.trim().slice(0, 30), href: a.href })).slice(0, 5);
    });
    log(`  Found: ${JSON.stringify(links)}`);
    
    if (links.length > 0) {
      await page2.goto(links[0].href, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 3000));
      log(`📍 URL: ${page2.url()}`);
      
      // Check for email signup form
      const hasEmail = await page2.$('input[type="email"]');
      if (hasEmail) {
        await hasEmail.click({ clickCount: 3 });
        await hasEmail.type(EMAIL, { delay: 30 });
        log('📧 Email entered on crypto.jobs');
      }
    }
  } catch (e) {
    log(`❌ Error: ${e.message}`);
  }
  await page2.close();

  await browser.close();
  log('\n✅ All registration attempts complete');
})();
