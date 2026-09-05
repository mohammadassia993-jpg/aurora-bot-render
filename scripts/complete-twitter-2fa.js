#!/usr/bin/env node
/**
 * complete-twitter-2fa.js
 * Completes Twitter 2FA activation using the 6-digit code
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOG_FILE = path.join(ROOT, 'logs', 'twitter-2fa.log');
const STATUS_FILE = path.join(ROOT, 'data', 'twitter-2fa-status.json');
const BACKUP_FILE = path.join(ROOT, 'deliverables', 'security', 'twitter-backup-codes.txt');

const TWITTER_USER = process.env.TWITTER_USERNAME || 'SilentGiants_Web3';
const TWITTER_PASS = process.env.TWITTER_PASSWORD || 'Silent@Web3#2026';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

const code = process.argv[2];

async function main() {
  if (!code || !/^\d{6}$/.test(code)) {
    log('Invalid code — must be 6 digits');
    console.log('error: invalid code');
    process.exit(1);
  }
  
  log(`=== Completing Twitter 2FA with code: ${code} ===`);
  
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    // Login
    log('Logging into Twitter...');
    await page.goto('https://twitter.com/i/flow/login', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    
    const usernameInput = await page.$('input[autocomplete="username"], input[name="text"]');
    if (usernameInput) {
      await usernameInput.type(TWITTER_USER, { delay: 50 });
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 3000));
    }
    
    const passwordInput = await page.$('input[name="password"]');
    if (passwordInput) {
      await passwordInput.type(TWITTER_PASS, { delay: 50 });
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 5000));
    }
    
    // Navigate to 2FA settings
    log('Navigating to 2FA settings...');
    await page.goto('https://twitter.com/settings/security', { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));
    
    // Click 2FA
    await page.evaluate(() => {
      const elements = [...document.querySelectorAll('a, button, [role="link"]')];
      const tf = elements.find(e => /two.factor|2fa|authentication/i.test(e.textContent));
      if (tf) tf.click();
    });
    await new Promise(r => setTimeout(r, 3000));
    
    // Click Authentication app
    await page.evaluate(() => {
      const elements = [...document.querySelectorAll('a, button, [role="button"]')];
      const option = elements.find(e => /authentication app|authenticator/i.test(e.textContent));
      if (option) option.click();
    });
    await new Promise(r => setTimeout(r, 3000));
    
    // Enter the 6-digit code
    log('Entering 6-digit code...');
    const codeInput = await page.$('input[name="challenge_response"], input[inputmode="numeric"], input[type="text"]');
    if (codeInput) {
      await codeInput.type(code, { delay: 100 });
      await new Promise(r => setTimeout(r, 1000));

      // Prefer "remember/trust this device" so the account stops asking for a code each login.
      log('Trying to opt into remember/trust this device...');
      await page.evaluate(() => {
        const labels = [...document.querySelectorAll('label, span, div')];
        const target = labels.find(e => /remember this device|trust this device|don.t ask|stay signed in|remember me/i.test(e.textContent || '') && (e.textContent || '').length < 60);
        if (target) {
          const cb = target.querySelector('input[type=checkbox]') || target.querySelector('input[type=radio]');
          if (cb && !cb.checked) cb.click();
        }
      });
      await new Promise(r => setTimeout(r, 800));
      
      // Click confirm/submit
      const confirmBtn = await page.$('button[type="submit"], [data-testid="TOTPConfirm"]');
      if (confirmBtn) {
        await confirmBtn.click();
        await new Promise(r => setTimeout(r, 5000));
        
        log('Code submitted');
        
        // Check for backup codes
        const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 1000) || '');
        
        if (/backup|recovery|codes|كود|استرداد/i.test(pageText)) {
          log('Backup codes page detected');
          
          // Extract backup codes
          const codes = await page.evaluate(() => {
            const text = document.body?.innerText || '';
            const matches = text.match(/\b\d{4}\s?\d{4}\b/g) || text.match(/\b[A-Z0-9]{4}\s?[A-Z0-9]{4}\b/g);
            return matches || [];
          });
          
          if (codes.length > 0) {
            log(`Backup codes found: ${codes.length}`);
            fs.mkdirSync(path.dirname(BACKUP_FILE), { recursive: true });
            fs.writeFileSync(BACKUP_FILE, `Twitter Backup Codes — @${TWITTER_USER}\nGenerated: ${new Date().toISOString()}\n\n${codes.join('\n')}\n\n⚠️ KEEP THESE CODES SAFE!\nEach code can only be used once.`);
            log('Backup codes saved');
          }
        }
        
        // Update status
        fs.writeFileSync(STATUS_FILE, JSON.stringify({
          status: 'activated',
          timestamp: new Date().toISOString(),
          code: '***',
          backupCodesSaved: codes?.length > 0
        }, null, 2));
        
        console.log('success');
        log('2FA activation completed successfully');
      }
    } else {
      log('Code input not found');
      console.log('error: code input not found');
    }
    
  } catch (err) {
    log(`Error: ${err.message}`);
    console.log(`error: ${err.message}`);
  }

  await browser.close();
  log('=== Complete Twitter 2FA finished ===');
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  console.log(`error: ${err.message}`);
  process.exit(1);
});
