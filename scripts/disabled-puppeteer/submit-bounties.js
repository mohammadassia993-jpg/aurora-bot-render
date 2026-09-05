#!/usr/bin/env node
/**
 * Submit on accessible job/bounty platforms via Puppeteer
 */
import puppeteer from 'puppeteer';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

(async () => {
  log('🚀 Starting bounty submission...');
  
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

  // Check BountyCaster
  log('\n📋 Checking BountyCaster...');
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  
  try {
    await page.goto('https://bountycaster.xyz', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    log(`📍 URL: ${page.url()}`);
    
    const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
    log(`📄 Page: ${pageText.slice(0, 200).replace(/\n/g, ' ')}`);
    
    // Look for bounty listings
    const bounties = await page.evaluate(() => {
      const items = document.querySelectorAll('[class*="bounty"], [class*="task"], [class*="card"]');
      return Array.from(items).slice(0, 5).map(el => el.textContent?.trim().slice(0, 100));
    });
    log(`📋 Found ${bounties.length} bounty elements`);
    bounties.forEach((b, i) => log(`  ${i+1}. ${b}`));
  } catch (e) {
    log(`❌ BountyCaster error: ${e.message}`);
  }
  await page.close();

  // Check crypto.jobs
  log('\n📋 Checking crypto.jobs...');
  const page2 = await browser.newPage();
  await page2.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  
  try {
    await page2.goto('https://crypto.jobs/jobs?q=content+writer', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    log(`📍 URL: ${page2.url()}`);
    
    const jobs = await page2.evaluate(() => {
      const items = document.querySelectorAll('.job-title, [itemprop="title"]');
      return Array.from(items).slice(0, 5).map(el => el.textContent?.trim());
    });
    log(`📋 Found ${jobs.length} job listings`);
    jobs.forEach((j, i) => log(`  ${i+1}. ${j}`));
  } catch (e) {
    log(`❌ crypto.jobs error: ${e.message}`);
  }
  await page2.close();

  await browser.close();
  log('\n✅ Platform check complete');
})();
