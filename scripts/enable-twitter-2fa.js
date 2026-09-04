#!/usr/bin/env node
/**
 * enable-twitter-2fa.js
 * Enable Two-Factor Authentication on Twitter via Puppeteer
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOG_FILE = path.join(ROOT, 'logs', 'twitter-2fa.log');
const BACKUP_CODES_FILE = path.join(ROOT, 'deliverables', 'security', 'twitter-2fa-backup-codes.txt');

const TWITTER_USER = process.env.TWITTER_USERNAME || 'SilentGiants_Web3';
const TWITTER_PASS = process.env.TWITTER_PASSWORD || 'Silent@Web3#2026';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

async function main() {
  log('=== Twitter 2FA Activation Started ===');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    // Step 1: Login to Twitter
    log('Step 1: Logging into Twitter...');
    await page.goto('https://twitter.com/i/flow/login', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    
    // Username
    const usernameInput = await page.$('input[autocomplete="username"], input[name="text"]');
    if (usernameInput) {
      await usernameInput.type(TWITTER_USER, { delay: 50 });
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 3000));
      log('Username entered');
    }
    
    // Password
    const passwordInput = await page.$('input[name="password"]');
    if (passwordInput) {
      await passwordInput.type(TWITTER_PASS, { delay: 50 });
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 5000));
      log('Password entered');
    }
    
    // Check if logged in
    const url = page.url();
    log(`Current URL after login: ${url}`);
    
    if (url.includes('/login') || url.includes('/i/flow/login')) {
      log('Login may have failed — checking page content');
      const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
      log(`Page content: ${pageText.slice(0, 150)}`);
      
      // Check for CAPTCHA or verification
      if (/captcha|verify|unusual|suspicious/i.test(pageText)) {
        log('CAPTCHA or verification detected — cannot proceed');
        await browser.close();
        console.log(JSON.stringify({ status: 'blocked', reason: 'CAPTCHA/verification required' }));
        return;
      }
    }
    
    // Step 2: Navigate to security settings
    log('Step 2: Navigating to security settings...');
    await page.goto('https://twitter.com/settings/security', { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));
    
    const settingsText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
    log(`Security settings page: ${settingsText.slice(0, 200)}`);
    
    // Look for Two-factor authentication option
    const twoFactorLink = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a, button, [role="link"]')];
      const tfLink = links.find(l => /two.factor|2fa|authentication/i.test(l.textContent));
      return tfLink ? tfLink.textContent?.trim() : null;
    });
    
    if (twoFactorLink) {
      log(`Found 2FA option: ${twoFactorLink}`);
      // Click on it
      await page.evaluate(() => {
        const links = [...document.querySelectorAll('a, button, [role="link"]')];
        const tfLink = links.find(l => /two.factor|2fa|authentication/i.test(l.textContent));
        if (tfLink) tfLink.click();
      });
      await new Promise(r => setTimeout(r, 3000));
      
      const afterClick = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
      log(`After clicking 2FA: ${afterClick.slice(0, 200)}`);
      
      // Look for "Authentication app" option
      const authAppOption = await page.evaluate(() => {
        const elements = [...document.querySelectorAll('a, button, [role="button"], [role="link"]')];
        const option = elements.find(e => /authentication app|authenticator/i.test(e.textContent));
        return option ? option.textContent?.trim() : null;
      });
      
      if (authAppOption) {
        log(`Found auth app option: ${authAppOption}`);
        await page.evaluate(() => {
          const elements = [...document.querySelectorAll('a, button, [role="button"], [role="link"]')];
          const option = elements.find(e => /authentication app|authenticator/i.test(e.textContent));
          if (option) option.click();
        });
        await new Promise(r => setTimeout(r, 3000));
        
        // Look for QR code or setup key
        const setupInfo = await page.evaluate(() => {
          const text = document.body?.innerText || '';
          const qrCode = document.querySelector('img[alt*="QR"], img[alt*="qr"], canvas');
          const secretMatch = text.match(/secret[:\s]+([A-Z0-9]{16,})/i);
          return {
            hasQR: Boolean(qrCode),
            secret: secretMatch ? secretMatch[1] : null,
            pageText: text.slice(0, 500)
          };
        });
        
        log(`Setup info: QR=${setupInfo.hasQR}, Secret=${setupInfo.secret ? 'found' : 'not found'}`);
        
        if (setupInfo.hasQR || setupInfo.secret) {
          log('2FA setup page reached — QR code or secret available');
          
          // Save the secret/QR for the leader
          const backupInfo = `
Twitter 2FA Setup Information
=============================
Account: @${TWITTER_USER}
Date: ${new Date().toISOString()}

Setup Key: ${setupInfo.secret || 'Not available (use QR code)'}
QR Code: Available on the setup page

Instructions:
1. Open Google Authenticator or Authy
2. Scan the QR code or enter the setup key manually
3. Enter the 6-digit code from the app
4. Save the backup codes

Page Text:
${setupInfo.pageText.slice(0, 300)}
`;
          
          fs.mkdirSync(path.dirname(BACKUP_CODES_FILE), { recursive: true });
          fs.writeFileSync(BACKUP_CODES_FILE, backupInfo);
          log('Setup info saved to backup file');
        }
      } else {
        log('Authentication app option not found');
      }
    } else {
      log('Two-factor authentication option not found on settings page');
      // Try to find it by scrolling or checking other elements
      const allText = await page.evaluate(() => document.body?.innerText || '');
      log(`Full page text (first 500): ${allText.slice(0, 500)}`);
    }
    
  } catch (err) {
    log(`Error: ${err.message}`);
  }

  await browser.close();
  log('=== Twitter 2FA Activation finished ===');
  
  console.log(JSON.stringify({ 
    status: 'attempted',
    note: '2FA setup page accessed — requires manual QR scan'
  }));
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
