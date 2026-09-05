#!/usr/bin/env node
/**
 * auto-create-accounts.js
 * Attempt to create Telegram channel + Twitter account via Puppeteer
 * Runs on Render (x86_64 with Chrome)
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOG_FILE = path.join(ROOT, 'logs', 'account-creation.log');
const RESULTS_FILE = path.join(ROOT, 'deliverables', 'account-creation-results.json');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

async function attemptTelegramChannel(browser) {
  log('--- Attempting Telegram Channel Creation ---');
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  try {
    // Navigate to Telegram Web
    log('Opening Telegram Web...');
    await page.goto('https://web.telegram.org/k/', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    
    const title = await page.title();
    log(`Page title: ${title}`);
    
    // Check if we see the QR code or login form
    const pageContent = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
    log(`Page content preview: ${pageContent.slice(0, 200)}`);
    
    // Telegram Web requires phone number login - can't bypass
    log('Telegram Web requires phone number + code verification');
    log('Cannot create channel without logged-in user session');
    
    // Alternative: Try using Bot API to forward messages to a channel
    // But bots can't CREATE channels
    log('Bot API limitation: bots cannot create channels');
    log('Solution: Create channel manually via Telegram app (2 minutes)');
    
    await page.close();
    return { 
      status: 'blocked', 
      reason: 'Telegram requires phone verification for channel creation',
      solution: 'Create channel manually in Telegram app, then add bot as admin'
    };
  } catch (err) {
    log(`Telegram error: ${err.message}`);
    await page.close();
    return { status: 'error', error: err.message };
  }
}

async function attemptTwitterAccount(browser) {
  log('--- Attempting Twitter Account Creation ---');
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  try {
    log('Opening Twitter signup...');
    await page.goto('https://twitter.com/i/flow/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    
    const title = await page.title();
    log(`Page title: ${title}`);
    
    // Check what's on the page
    const elements = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')];
      const buttons = [...document.querySelectorAll('button')];
      return {
        inputs: inputs.map(i => ({ type: i.type, name: i.name, placeholder: i.placeholder, ariaLabel: i.getAttribute('aria-label') })),
        buttons: buttons.map(b => b.textContent?.trim()).filter(Boolean).slice(0, 10),
        bodyText: document.body?.innerText?.slice(0, 300) || ''
      };
    });
    
    log(`Inputs: ${JSON.stringify(elements.inputs)}`);
    log(`Buttons: ${JSON.stringify(elements.buttons)}`);
    log(`Body: ${elements.bodyText.slice(0, 150)}`);
    
    // Try to find and fill the name field
    const nameInput = await page.$('input[name="name"]');
    if (nameInput) {
      log('Found name input — filling...');
      await nameInput.type('Silent Giants | عمالقة الصمت', { delay: 50 });
      
      // Look for next/submit button
      const nextBtn = await page.$('button[type="submit"], button[data-testid="LoginForm_Login_Button"]');
      if (nextBtn) {
        log('Clicking next...');
        await nextBtn.click();
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    
    // Check if we hit a CAPTCHA or phone verification
    const afterClick = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
    log(`After interaction: ${afterClick.slice(0, 200)}`);
    
    if (/captcha|verify|phone|验证码|telefon/i.test(afterClick)) {
      log('Hit verification wall — cannot proceed automatically');
      await page.close();
      return {
        status: 'blocked',
        reason: 'Twitter requires phone/CAPTCHA verification',
        solution: 'Create account manually (5 minutes), then add credentials to .env'
      };
    }
    
    await page.close();
    return { status: 'attempted', note: 'Check logs for details' };
  } catch (err) {
    log(`Twitter error: ${err.message}`);
    await page.close();
    return { status: 'error', error: err.message };
  }
}

async function main() {
  log('=== Auto Account Creation Started ===');
  
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const results = {
    timestamp: new Date().toISOString(),
    telegram: await attemptTelegramChannel(browser),
    twitter: await attemptTwitterAccount(browser)
  };

  await browser.close();

  // Save results
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  log(`Results saved to ${RESULTS_FILE}`);
  
  // Summary
  log('=== Summary ===');
  log(`Telegram: ${results.telegram.status} — ${results.telegram.reason || results.telegram.error || 'check details'}`);
  log(`Twitter: ${results.twitter.status} — ${results.twitter.reason || results.twitter.error || 'check details'}`);
  log('');
  log('Both platforms require phone verification which cannot be automated.');
  log('Manual creation required (5-10 minutes total).');
  log('=== Auto Account Creation finished ===');
  
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
