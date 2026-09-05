#!/usr/bin/env node
/**
 * twitter-api-post.js
 * Post to Twitter using session cookies from Puppeteer login
 * More robust than direct API (no OAuth needed)
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const LOG_FILE = path.join(ROOT, 'logs', 'twitter-publish.log');
const COOKIES_FILE = path.join(ROOT, 'data', 'twitter-cookies.json');

const TWITTER_USER = process.env.TWITTER_USERNAME || 'SilentGiants_Web3';
const TWITTER_PASS = process.env.TWITTER_PASSWORD || 'Silent@Web3#2026';
const STORE_URL = 'https://mohammadassia993-jpg.github.io/aurora-bot-render/';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

const TWEETS = [
  // Arabic
  `🛒 منتجاتنا الرقمية جاهزة!\n\n📖 قاموس Web3 — 15$\n🎓 دورة DePIN — 25$\n✍️ حزمة كتابة — 35$\n\n💳 USDT/USDC\n📎 ${STORE_URL}\n💬 @Aurora_Almada_88_Bot\n\n#Web3 #DeFi`,
  
  // English
  `🌟 Digital Products Ready!\n\n📖 Web3 Glossary — $15\n🎓 DePIN Course — $25\n✍️ Content Pack — $35\n\n💳 USDT/USDC\n📎 ${STORE_URL}\n💬 @Aurora_Almada_88_Bot\n\n#Web3 #Crypto`,
  
  // Turkish
  `🛒 Dijital Ürünler Hazır!\n\n📖 Web3 Sözlüğü — 15$\n🎓 DePIN Kursu — 25$\n✍️ İçerik Paketi — 35$\n\n💳 USDT/USDC\n📎 ${STORE_URL}\n💬 @Aurora_Almada_88_Bot\n\n#Web3 #Kripto`,
  
  // Persian
  `🛒 محصولات دیجیتال آماده!\n\n📖 واژه‌نامه Web3 — ۱۵\$\n🎓 دوره DePIN — ۲۵\$\n✍️ بسته محتوا — ۳۵\$\n\n💳 USDT/USDC\n📎 ${STORE_URL}\n💬 @Aurora_Almada_88_Bot\n\n#Web3 #کریپتو`,
  
  // Urdu
  `🛒 ڈیجیٹل مصنوعات تیار!\n\n📖 Web3 لغت — 15\$\n🎓 DePIN کورس — 25\$\n✍️ مواد پیک — 35\$\n\n💳 USDT/USDC\n📎 ${STORE_URL}\n💬 @Aurora_Almada_88_Bot\n\n#Web3 #کرپٹو`
];

async function main() {
  log('=== Twitter API Post Started ===');
  
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Try to load saved cookies
  let cookiesLoaded = false;
  if (fs.existsSync(COOKIES_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
      await page.setCookie(...cookies);
      cookiesLoaded = true;
      log('Loaded saved cookies');
    } catch {}
  }

  // Navigate to Twitter
  await page.goto('https://twitter.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  const url = page.url();
  log(`Current URL: ${url}`);

  if (url.includes('/login') || url.includes('/i/flow/login')) {
    log('Not logged in — attempting login...');
    
    // Try login
    try {
      await page.goto('https://twitter.com/i/flow/login', { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));
      
      // Username
      const usernameInput = await page.$('input[autocomplete="username"], input[name="text"]');
      if (usernameInput) {
        await usernameInput.type(TWITTER_USER, { delay: 50 });
        await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 3000));
      }
      
      // Password
      const passwordInput = await page.$('input[name="password"]');
      if (passwordInput) {
        await passwordInput.type(TWITTER_PASS, { delay: 50 });
        await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 5000));
      }
      
      // Save cookies
      const cookies = await page.cookies();
      fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies));
      log('Cookies saved');
      
    } catch (err) {
      log(`Login error: ${err.message}`);
    }
  }

  // Check if logged in now
  await page.goto('https://twitter.com/home', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  
  const currentUrl = page.url();
  if (currentUrl.includes('/home') && !currentUrl.includes('/login')) {
    log('Successfully logged in!');
    
    // Post tweets
    let posted = 0;
    for (const tweet of TWEETS) {
      try {
        await page.goto('https://twitter.com/compose/tweet', { waitUntil: 'networkidle2', timeout: 20000 });
        await new Promise(r => setTimeout(r, 2000));
        
        const tweetBox = await page.$('[data-testid="tweetTextarea_0"], [role="textbox"], div[contenteditable="true"]');
        if (tweetBox) {
          await tweetBox.click();
          await page.keyboard.type(tweet.slice(0, 280), { delay: 15 });
          await new Promise(r => setTimeout(r, 1000));
          
          const tweetBtn = await page.$('[data-testid="tweetButton"]');
          if (tweetBtn) {
            await tweetBtn.click();
            await new Promise(r => setTimeout(r, 3000));
            posted++;
            log(`✅ Tweet ${posted}/5 posted`);
          }
        }
        await new Promise(r => setTimeout(r, 5000));
      } catch (err) {
        log(`Tweet error: ${err.message}`);
      }
    }
    
    log(`Total posted: ${posted}/5`);
  } else {
    log('Login failed — CAPTCHA or verification required');
    log('Manual intervention needed for Twitter');
  }

  await browser.close();
  log('=== Twitter API Post finished ===');
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
