#!/usr/bin/env node
/**
 * create-twitter-account.js
 * Create Twitter/X account @SilentGiants_Web3 via Puppeteer
 * Must run on Render (x86_64 with Chrome)
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOG_FILE = path.join(ROOT, 'logs', 'twitter-create.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

async function main() {
  log('=== Creating Twitter Account @SilentGiants_Web3 ===');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    // Go to Twitter signup
    log('Navigating to Twitter signup...');
    await page.goto('https://twitter.com/i/flow/signup', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    const title = await page.title();
    log(`Page title: ${title}`);
    
    // Check if we can see the signup form
    const hasForm = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')];
      return inputs.map(i => ({ type: i.type, name: i.name, placeholder: i.placeholder }));
    });
    
    log(`Form fields found: ${JSON.stringify(hasForm)}`);
    
    if (hasForm.length === 0) {
      log('No form found — Twitter may be blocking automated access');
      log('Manual account creation required');
      
      // Save instructions for manual creation
      const instructions = `# Twitter Account Creation — Manual Steps\n\n## Account: @SilentGiants_Web3\n\n1. Go to https://twitter.com/i/flow/signup\n2. Use email: auroraalmada4@gmail.com\n3. Display name: Silent Giants | Web3 Arabic\n4. Bio: Arabic Web3 content, translation & community services | Products: https://mohammadassia993-jpg.github.io/aurora-bot-render/\n5. Profile picture: Use logo from repo\n6. After creation, add credentials to .env\n\n## Why manual?\nTwitter blocks automated signups with CAPTCHA/phone verification.\n`;
      
      fs.writeFileSync(path.join(ROOT, 'deliverables', 'twitter-setup-guide.md'), instructions);
      log('Manual setup guide saved');
    }
    
  } catch (err) {
    log(`Error: ${err.message}`);
  }

  await browser.close();
  log('=== Twitter Account Creation finished ===');
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
