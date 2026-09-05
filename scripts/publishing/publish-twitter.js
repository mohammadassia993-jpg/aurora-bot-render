#!/usr/bin/env node
/**
 * publish-twitter.js
 * Publish posts to Twitter/X via Puppeteer
 * Uses saved session or fresh login
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const LOG_FILE = path.join(ROOT, 'logs', 'twitter-publish.log');
const POSTS_FILE = path.join(ROOT, 'deliverables', 'publishing', 'multilang-posts.json');
const SESSION_FILE = path.join(ROOT, 'data', 'twitter-session.json');

const TWITTER_USER = process.env.TWITTER_USERNAME || 'SilentGiants_Web3';
const TWITTER_PASS = process.env.TWITTER_PASSWORD || 'Silent@Web3#2026';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

async function loginTwitter(page) {
  log('Logging into Twitter...');
  await page.goto('https://twitter.com/i/flow/login', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  
  // Enter username
  const usernameInput = await page.$('input[autocomplete="username"]');
  if (usernameInput) {
    await usernameInput.type(TWITTER_USER, { delay: 50 });
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Enter password
  const passwordInput = await page.$('input[name="password"]');
  if (passwordInput) {
    await passwordInput.type(TWITTER_PASS, { delay: 50 });
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 5000));
  }
  
  // Check if logged in
  const url = page.url();
  if (url.includes('/home') || url.includes('/twitter.com')) {
    log('Login successful!');
    return true;
  }
  
  log('Login may have failed — check manually');
  return false;
}

async function postTweet(page, text) {
  try {
    await page.goto('https://twitter.com/compose/tweet', { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 2000));
    
    // Find tweet input
    const tweetInput = await page.$('[data-testid="tweetTextarea_0"], [role="textbox"], div[contenteditable="true"]');
    if (tweetInput) {
      await tweetInput.click();
      await page.keyboard.type(text.slice(0, 280), { delay: 20 });
      await new Promise(r => setTimeout(r, 1000));
      
      // Click tweet button
      const tweetBtn = await page.$('[data-testid="tweetButton"], button[data-testid="tweetButtonInline"]');
      if (tweetBtn) {
        await tweetBtn.click();
        await new Promise(r => setTimeout(r, 3000));
        log('Tweet posted!');
        return true;
      }
    }
    
    log('Could not find tweet input');
    return false;
  } catch (err) {
    log(`Tweet error: ${err.message}`);
    return false;
  }
}

async function main() {
  log('=== Twitter Publishing Started ===');
  
  // Load posts
  if (!fs.existsSync(POSTS_FILE)) {
    log('No posts file found');
    process.exit(1);
  }
  
  const posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
  
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Login
  const loggedIn = await loginTwitter(page);
  if (!loggedIn) {
    log('Login failed — aborting');
    await browser.close();
    process.exit(1);
  }

  // Post tweets (2 per language = 10 total)
  let posted = 0;
  for (const [lang, langPosts] of Object.entries(posts)) {
    for (const post of langPosts.slice(0, 2)) {
      const text = post.text.replace(/\n{3,}/g, '\n\n').slice(0, 280);
      const success = await postTweet(page, text);
      if (success) posted++;
      await new Promise(r => setTimeout(r, 5000)); // Rate limit protection
    }
  }

  await browser.close();
  log(`Twitter publishing complete: ${posted} tweets posted`);
  log('=== Twitter Publishing finished ===');
  
  console.log(JSON.stringify({ posted, total: Object.keys(posts).length * 2 }));
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
