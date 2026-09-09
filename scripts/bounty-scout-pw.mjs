import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',
  args: ['--no-sandbox']
});

async function scoutBounties(url, name) {
  const page = await browser.newPage();
  try {
    console.log(`\n=== ${name} ===`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(5000);
    const body = await page.evaluate(() => document.body.innerText.slice(0, 4000));
    const bountyPatterns = body.match(/(?:bounty|prize|reward|award|fund|grant)[^\n]{0,200}/gi) || [];
    console.log('Content preview:', body.replace(/\n+/g, ' | ').slice(0, 500));
    console.log('Bounty patterns:', bountyPatterns.length);
    if (bountyPatterns.length > 0) {
      bountyPatterns.slice(0, 5).forEach(b => console.log('  -', b.trim().slice(0, 150)));
    }
    return { platform: name, url, patterns: bountyPatterns.length, samples: bountyPatterns.slice(0, 5) };
  } catch (e) {
    console.log('Error:', e.message.slice(0, 100));
    return { platform: name, error: e.message };
  } finally {
    await page.close();
  }
}

const results = [];

results.push(await scoutBounties('https://gitcoin.co/bounties?status=open', 'Gitcoin'));
results.push(await scoutBounties('https://algora.io/bounties', 'Algora'));
results.push(await scoutBounties('https://app.dework.xyz/explore', 'DeWork'));
results.push(await scoutBounties('https://replit.com/bounties', 'Replit'));

console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(results.map(r => ({
  platform: r.platform,
  patterns: r.patterns || 0,
  error: r.error || null,
  samples: (r.samples || []).slice(0, 3)
})), null, 2));

await browser.close();
