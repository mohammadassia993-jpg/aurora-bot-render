import { chromium } from 'playwright';
import fs from 'node:fs';

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  const allOpps = [];
  
  // === SUPERTEAM ===
  console.log('=== SUPERTEAM EARN ===');
  try {
    await page.goto('https://earn.superteam.io/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const body = await page.evaluate(() => document.body?.innerText || '');
    console.log('Body length:', body.length);
    console.log('First 300:', body.slice(0, 300));
    
    // Get all bounty/opportunity links
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="bount"], a[href*="listing"], a[href*="opportunity"]')).map(a => ({
        text: a.innerText?.trim().slice(0, 100),
        href: a.href
      })).filter(l => l.text.length > 5).slice(0, 30);
    });
    console.log('Links found:', links.length);
    links.forEach(l => console.log(`  ${l.text.slice(0, 60)} → ${l.href.slice(0, 80)}`));
    
    // Try the bounties page specifically
    await page.goto('https://earn.superteam.io/bounties', { timeout: 20000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const bountyBody = await page.evaluate(() => document.body?.innerText || '');
    console.log('\nBounties page length:', bountyBody.length);
    console.log('Bounties first 500:', bountyBody.slice(0, 500));
    
    // Extract bounty items
    const bountyItems = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('a[href*="bount"]').forEach(a => {
        const text = a.innerText?.trim();
        if (text && text.length > 10) {
          items.push({ title: text.slice(0, 150), url: a.href });
        }
      });
      return items.slice(0, 20);
    });
    console.log('Bounty items:', bountyItems.length);
    bountyItems.forEach(b => {
      allOpps.push({ source: 'superteam', ...b });
      console.log(`  ✅ ${b.title.slice(0, 80)}`);
    });
    
  } catch (e) {
    console.log('Superteam error:', e.message.slice(0, 200));
  }
  
  // === GITCOIN ===
  console.log('\n=== GITCOIN ===');
  try {
    await page.goto('https://gitcoin.co/bounties', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const body = await page.evaluate(() => document.body?.innerText || '');
    console.log('Body length:', body.length);
    console.log('First 500:', body.slice(0, 500));
    
    // Extract bounty items
    const bountyItems = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('a[href*="bounty"]').forEach(a => {
        const text = a.innerText?.trim();
        if (text && text.length > 10) {
          items.push({ title: text.slice(0, 150), url: a.href });
        }
      });
      return items.slice(0, 20);
    });
    console.log('Gitcoin items:', bountyItems.length);
    bountyItems.forEach(b => {
      allOpps.push({ source: 'gitcoin', ...b });
      console.log(`  ✅ ${b.title.slice(0, 80)}`);
    });
    
  } catch (e) {
    console.log('Gitcoin error:', e.message.slice(0, 200));
  }
  
  // Save all
  fs.writeFileSync('/root/silent-giants/deliverables/superteam-gitcoin-results.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    total: allOpps.length,
    opportunities: allOpps
  }, null, 2));
  console.log(`\nTotal from Superteam+Gitcoin: ${allOpps.length}`);
  
  await browser.close();
}

main();
