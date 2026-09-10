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
  
  console.log('=== GITCOIN BOUNTIES ===');
  try {
    await page.goto('https://gitcoin.co/bounties', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    
    const body = await page.evaluate(() => document.body?.innerText || '');
    console.log('Body length:', body.length);
    
    // Get all bounty links
    const bounties = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('a').forEach(a => {
        const href = a.href || '';
        const text = a.innerText?.trim() || '';
        if (href.includes('/bounties/') && text.length > 5) {
          items.push({ title: text.slice(0, 100), url: href });
        }
      });
      return items.slice(0, 30);
    });
    console.log('Bounties found:', bounties.length);
    bounties.forEach((b, i) => console.log(`  ${i+1}. ${b.title.slice(0, 60)} → ${b.url.slice(0, 80)}`));
    
    // Try to find content/writing bounties
    const contentBounties = bounties.filter(b => {
      const t = b.title.toLowerCase();
      return t.includes('content') || t.includes('writing') || t.includes('translation') || 
             t.includes('article') || t.includes('documentation') || t.includes('marketing') ||
             t.includes('community');
    });
    console.log('\nContent-related bounties:', contentBounties.length);
    contentBounties.forEach((b, i) => console.log(`  ${i+1}. ${b.title.slice(0, 60)}`));
    
    // Save results
    fs.writeFileSync('/root/silent-giants/deliverables/gitcoin-bounties.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      total: bounties.length,
      content_bounties: contentBounties.length,
      bounties: bounties.slice(0, 20)
    }, null, 2));
    
  } catch (e) {
    console.log('Error:', e.message.slice(0, 200));
  }
  
  await browser.close();
}

main();
