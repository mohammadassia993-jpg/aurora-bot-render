#!/usr/bin/env node
/**
 * virtual-number-account-creator.js
 * Attempt to create accounts using virtual phone numbers via Puppeteer
 * Strategy: Use free SMS services to get a number, then register
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOG_FILE = path.join(ROOT, 'logs', 'virtual-number.log');
const RESULTS_FILE = path.join(ROOT, 'deliverables', 'virtual-number-results.json');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

// Free SMS services to try
const SMS_SERVICES = [
  {
    name: 'receive-smss.com',
    url: 'https://receive-smss.com/sms/1/',
    extractNumbers: async (page) => {
      return page.evaluate(() => {
        const nums = [...document.querySelectorAll('.number-item, .phone-number, [data-phone]')];
        return nums.map(n => n.textContent?.trim() || n.getAttribute('data-phone')).filter(Boolean).slice(0, 3);
      });
    }
  },
  {
    name: 'freephonenum.com',
    url: 'https://freephonenum.com/united-states',
    extractNumbers: async (page) => {
      return page.evaluate(() => {
        const nums = [...document.querySelectorAll('a[href*="/sms/"]')];
        return nums.map(n => n.textContent?.trim()).filter(Boolean).slice(0, 3);
      });
    }
  },
  {
    name: 'receive-a-sms.com',
    url: 'https://receive-a-sms.com/',
    extractNumbers: async (page) => {
      return page.evaluate(() => {
        const nums = [...document.querySelectorAll('.phone-number, .number, [data-number]')];
        return nums.map(n => n.textContent?.trim() || n.getAttribute('data-number')).filter(Boolean).slice(0, 3);
      });
    }
  }
];

async function getVirtualNumber(page, service) {
  log(`Trying ${service.name}...`);
  try {
    await page.goto(service.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));
    
    const numbers = await service.extractNumbers(page);
    log(`Found ${numbers.length} numbers from ${service.name}`);
    
    if (numbers.length > 0) {
      log(`First number: ${numbers[0]}`);
      return numbers[0];
    }
    
    // Try to get any number from the page
    const anyNumber = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      const match = text.match(/\+\d{10,15}/);
      return match ? match[0] : null;
    });
    
    if (anyNumber) {
      log(`Found number from text: ${anyNumber}`);
      return anyNumber;
    }
  } catch (err) {
    log(`Error with ${service.name}: ${err.message}`);
  }
  return null;
}

async function attemptTelegramRegistration(page, phoneNumber) {
  log(`Attempting Telegram registration with ${phoneNumber}...`);
  try {
    await page.goto('https://web.telegram.org/k/', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    
    // Check if we see the login page
    const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
    log(`Telegram page: ${pageText.slice(0, 150)}`);
    
    // Look for phone input
    const phoneInput = await page.$('input[type="tel"], input[name="phone"], input input[type="text"]');
    if (phoneInput) {
      log('Found phone input — typing number...');
      await phoneInput.click({ clickCount: 3 });
      await phoneInput.type(phoneNumber, { delay: 50 });
      await new Promise(r => setTimeout(r, 1000));
      
      // Click next
      const nextBtn = await page.$('button[type="submit"], .btn-primary, button');
      if (nextBtn) {
        await nextBtn.click();
        await new Promise(r => setTimeout(r, 5000));
        
        const afterClick = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
        log(`After clicking next: ${afterClick.slice(0, 150)}`);
        
        if (/code|verification|أدخل|تحقق/i.test(afterClick)) {
          log('Waiting for verification code...');
          return { status: 'waiting_for_code', number: phoneNumber };
        }
      }
    } else {
      log('No phone input found on Telegram Web');
    }
    
    return { status: 'failed', reason: 'Could not find phone input' };
  } catch (err) {
    log(`Telegram registration error: ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

async function main() {
  log('=== Virtual Number Account Creator Started ===');
  
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Step 1: Get a virtual number
  let phoneNumber = null;
  for (const service of SMS_SERVICES) {
    phoneNumber = await getVirtualNumber(page, service);
    if (phoneNumber) break;
    await new Promise(r => setTimeout(r, 2000));
  }

  const results = {
    timestamp: new Date().toISOString(),
    phoneNumber: phoneNumber,
    telegram: null,
    twitter: null
  };

  if (phoneNumber) {
    // Step 2: Attempt Telegram registration
    results.telegram = await attemptTelegramRegistration(page, phoneNumber);
    
    // Step 3: Attempt Twitter registration (will likely fail due to CAPTCHA)
    log('Twitter requires CAPTCHA — skipping automated attempt');
    results.twitter = { status: 'blocked', reason: 'Twitter requires CAPTCHA + phone verification' };
  } else {
    log('No virtual number available from any service');
    results.telegram = { status: 'blocked', reason: 'No virtual numbers available' };
    results.twitter = { status: 'blocked', reason: 'No virtual numbers available' };
  }

  await browser.close();

  // Save results
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  log(`Results saved: ${JSON.stringify(results)}`);
  log('=== Virtual Number Account Creator finished ===');
  
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
