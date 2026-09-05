#!/usr/bin/env node
/**
 * twitter-2fa-qr-capture.js
 * Captures Twitter 2FA QR code and sends it to the Telegram bot
 * Then waits for /2fa <code> command to complete activation
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOG_FILE = path.join(ROOT, 'logs', 'twitter-2fa.log');
const QR_FILE = path.join(ROOT, 'uploads', 'twitter-2fa-qr.png');
const STATUS_FILE = path.join(ROOT, 'data', 'twitter-2fa-status.json');

const TWITTER_USER = process.env.TWITTER_USERNAME || 'SilentGiants_Web3';
const TWITTER_PASS = process.env.TWITTER_PASSWORD || 'Silent@Web3#2026';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const LEADER_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '888229115';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function updateStatus(status, data = {}) {
  const statusData = { status, timestamp: new Date().toISOString(), ...data };
  fs.writeFileSync(STATUS_FILE, JSON.stringify(statusData, null, 2));
  log(`Status updated: ${status}`);
}

async function sendToBot(text, photo = null) {
  if (!BOT_TOKEN) {
    log('No BOT_TOKEN — cannot send to bot');
    return;
  }
  
  try {
    if (photo) {
      // Send photo
      const formData = new FormData();
      formData.append('chat_id', LEADER_CHAT_ID);
      formData.append('photo', new Blob([fs.readFileSync(photo)]), 'qr-code.png');
      formData.append('caption', text);
      
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: formData
      });
      const result = await response.json();
      log(`Photo sent to bot: ${result.ok ? 'success' : result.description}`);
    } else {
      // Send text
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: LEADER_CHAT_ID, text })
      });
      const result = await response.json();
      log(`Message sent to bot: ${result.ok ? 'success' : result.description}`);
    }
  } catch (err) {
    log(`Send to bot error: ${err.message}`);
  }
}

async function main() {
  log('=== Twitter 2FA QR Capture Started ===');
  updateStatus('starting');
  
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // Step 1: Login to Twitter
    log('Step 1: Logging into Twitter...');
    await sendToBot('🔐 بدء عملية تفعيل 2FA على Twitter...\nجاري تسجيل الدخول...');
    
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
    
    const url = page.url();
    log(`After login URL: ${url}`);
    
    if (url.includes('/login') || url.includes('/i/flow/login')) {
      const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
      log(`Login page content: ${pageText.slice(0, 150)}`);
      
      if (/captcha|verify|unusual|suspicious|blocked/i.test(pageText)) {
        log('CAPTCHA/verification detected');
        updateStatus('blocked', { reason: 'CAPTCHA or verification required' });
        await sendToBot('❌ تم حظر تسجيل الدخول — Twitter يطلب CAPTCHA أو تحقق إضافي.\n\nالحل: يدوياً عبر تطبيق Twitter على الهاتف.');
        await browser.close();
        return;
      }
    }
    
    // Step 2: Navigate to security settings
    log('Step 2: Navigating to security settings...');
    await page.goto('https://twitter.com/settings/security', { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));
    
    const settingsText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
    log(`Settings page: ${settingsText.slice(0, 200)}`);
    
    // Step 3: Find and click Two-factor authentication
    log('Step 3: Looking for 2FA option...');
    const clicked2FA = await page.evaluate(() => {
      const elements = [...document.querySelectorAll('a, button, [role="link"], [role="button"]')];
      const tf = elements.find(e => /two.factor|2fa|authentication/i.test(e.textContent));
      if (tf) { tf.click(); return true; }
      return false;
    });
    
    if (clicked2FA) {
      await new Promise(r => setTimeout(r, 3000));
      log('Clicked 2FA option');
      
      // Step 4: Find and click Authentication app
      log('Step 4: Looking for Authentication app option...');
      const clickedAuthApp = await page.evaluate(() => {
        const elements = [...document.querySelectorAll('a, button, [role="button"], [role="link"]')];
        const option = elements.find(e => /authentication app|authenticator/i.test(e.textContent));
        if (option) { option.click(); return true; }
        return false;
      });
      
      if (clickedAuthApp) {
        await new Promise(r => setTimeout(r, 3000));
        log('Clicked Authentication app option');
        
        // Step 5: Capture QR code
        log('Step 5: Capturing QR code...');
        
        // Look for QR code image
        const qrFound = await page.evaluate(() => {
          const imgs = [...document.querySelectorAll('img')];
          const qr = imgs.find(i => 
            i.alt?.toLowerCase().includes('qr') || 
            i.src?.includes('qr') ||
            i.closest('[data-testid*="qr"]')
          );
          if (qr) {
            // Mark it for screenshot
            qr.id = 'twitter-qr-code';
            qr.style.border = '3px solid red';
            return true;
          }
          
          // Also check for canvas elements
          const canvases = [...document.querySelectorAll('canvas')];
          if (canvases.length > 0) {
            canvases[0].id = 'twitter-qr-code';
            return true;
          }
          
          return false;
        });
        
        if (qrFound) {
          // Take screenshot of the QR area
          const qrElement = await page.$('#twitter-qr-code');
          if (qrElement) {
            fs.mkdirSync(path.dirname(QR_FILE), { recursive: true });
            await qrElement.screenshot({ path: QR_FILE });
            log('QR code captured and saved');
            
            // Also get the setup key if available
            const setupKey = await page.evaluate(() => {
              const text = document.body?.innerText || '';
              const match = text.match(/(?:key|secret|setup)[:\s]+([A-Z0-9]{16,})/i);
              return match ? match[1] : null;
            });
            
            if (setupKey) {
              log(`Setup key found: ${setupKey}`);
            }
            
            // Send QR to bot
            await sendToBot(
              `🔐 رمز QR لتفعيل 2FA على Twitter\n\n📱 الخطوات:\n1. افتح Google Authenticator\n2. اضغط + (إضافة حساب)\n3. اختر "Scan a QR code"\n4. امسح الرمز من الصورة أدناه\n5. أدخل الرقم الستّي هنا:\n\n/configure /2fa <الرمز>\n\n⚠️ احفظ Backup Codes بعد التفعيل!`,
              QR_FILE
            );
            
            updateStatus('qr_sent', { setupKey, qrFile: QR_FILE });
            
            // Wait for /2fa command (poll for status changes)
            log('Waiting for /2fa <code> command...');
            log('The bot will handle the rest when code is received.');
            
          }
        } else {
          log('QR code not found on page');
          
          // Take full page screenshot for debugging
          fs.mkdirSync(path.dirname(QR_FILE), { recursive: true });
          await page.screenshot({ path: QR_FILE, fullPage: false });
          log('Full page screenshot saved for debugging');
          
          await sendToBot('⚠️ لم يتم العثور على رمز QR.\nتم حفظ لقطة شاشة للصفحة.\n\nيرجى التفعيل يدوياً عبر تطبيق Twitter.');
          updateStatus('qr_not_found');
        }
      } else {
        log('Authentication app option not found');
        updateStatus('auth_app_not_found');
      }
    } else {
      log('2FA option not found on settings page');
      updateStatus('2fa_option_not_found');
    }
    
  } catch (err) {
    log(`Error: ${err.message}`);
    updateStatus('error', { error: err.message });
  }

  await browser.close();
  log('=== Twitter 2FA QR Capture finished ===');
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
