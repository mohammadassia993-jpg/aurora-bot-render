import { chromium } from 'playwright';
import fs from 'node:fs';

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const results = [];

// External apply URLs extracted from job pages
const applyJobs = [
  {
    title: 'Freelance Writer',
    company: 'IAPWE',
    applyUrl: 'https://remotive.com/remote-jobs/writing/freelance-writer-1185979',
    externalUrl: null, // need to find
    source: 'remotive'
  },
  {
    title: 'Freelance Copywriter', 
    company: 'Coalition Technologies',
    applyUrl: 'https://remotive.com/remote-jobs/writing/freelance-copywriter-1749306',
    externalUrl: null,
    source: 'remotive'
  },
  {
    title: 'AI Response Analyst',
    company: 'iMerit Technology', 
    applyUrl: 'https://remoteok.com/l/1136795',
    externalUrl: 'https://remoteok.com/l/1136795',
    source: 'remoteok'
  },
  {
    title: 'Social Comms',
    company: 'NOPE',
    applyUrl: 'https://remoteok.com/l/1137314', 
    externalUrl: 'https://remoteok.com/l/1137314',
    source: 'remoteok'
  },
  {
    title: 'Content Reviewer',
    company: 'TELUS Digital',
    applyUrl: 'https://remotive.com/remote-jobs/all-others/content-reviewer-english-us-2091105',
    externalUrl: null,
    source: 'remotive'
  },
  {
    title: 'Junior Crypto Analyst',
    company: 'Empire Assets',
    applyUrl: 'https://remoteok.com/remote-jobs/remote-junior-crypto-analyst-trader-empire-asse-1137279',
    externalUrl: 'https://remoteok.com/l/1137279',
    source: 'remoteok'
  }
];

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  
  for (const job of applyJobs) {
    console.log(`\n=== ${job.title} @ ${job.company} ===`);
    const page = await ctx.newPage();
    
    try {
      // Navigate to the job page
      await page.goto(job.applyUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
      
      // Find all external apply links
      const applyLinks = await page.evaluate(() => {
        const links = [];
        document.querySelectorAll('a').forEach(a => {
          const href = a.href || '';
          const text = a.innerText?.trim() || '';
          if ((text.toLowerCase().includes('apply') || text.toLowerCase().includes('submit')) && 
              href.includes('http') && !href.includes('remotive.com') && !href.includes('remoteok.com')) {
            links.push({ text: text.slice(0, 50), href: href.slice(0, 200) });
          }
        });
        return links;
      });
      
      console.log('External apply links:', JSON.stringify(applyLinks));
      
      // Also check for email addresses in the page
      const emails = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        const matches = text.match(/[\w.-]+@[\w.-]+\.\w+/g) || [];
        return [...new Set(matches)];
      });
      console.log('Emails found:', emails);
      
      // Check for mailto links
      const mailtoLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href^="mailto:"]')).map(a => ({
          email: a.href.replace('mailto:', ''),
          text: a.innerText?.trim()
        }));
      });
      console.log('Mailto links:', JSON.stringify(mailtoLinks));
      
      // Try to find the actual apply button (scroll into view first)
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
      
      const applyBtn = await page.$('a:has-text("Apply"):visible, button:has-text("Apply"):visible');
      if (applyBtn) {
        console.log('Found visible Apply button');
        // Get the href before clicking
        const href = await applyBtn.evaluate(b => b.href || '');
        console.log('Apply href:', href);
        
        if (href && href.includes('http')) {
          // Navigate to the external apply URL
          const applyPage = await ctx.newPage();
          await applyPage.goto(href, { timeout: 20000, waitUntil: 'domcontentloaded' });
          await applyPage.waitForTimeout(3000);
          const applyBody = await applyPage.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
          console.log('Apply page body:', applyBody.slice(0, 300));
          
          // Check for form
          const hasForm = await applyPage.$('form');
          if (hasForm) {
            const inputs = await applyPage.evaluate(() => {
              return Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea')).map(i => ({
                type: i.type, name: i.name, placeholder: i.placeholder
              }));
            });
            console.log('Form inputs:', JSON.stringify(inputs));
          }
          
          results.push({ ...job, status: 'apply_page_opened', applyUrl: href, body: applyBody.slice(0, 200) });
          await applyPage.close();
        }
      } else {
        // Try clicking via JavaScript
        const clicked = await page.evaluate(() => {
          const btns = document.querySelectorAll('a, button');
          for (const btn of btns) {
            if (btn.innerText?.toLowerCase().includes('apply')) {
              btn.click();
              return true;
            }
          }
          return false;
        });
        
        if (clicked) {
          await page.waitForTimeout(5000);
          const newUrl = page.url();
          const newBody = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
          console.log('After JS click URL:', newUrl);
          console.log('After JS click body:', newBody.slice(0, 300));
          results.push({ ...job, status: 'js_clicked', url: newUrl, body: newBody.slice(0, 200) });
        } else {
          results.push({ ...job, status: 'no_apply_found', emails, mailtoLinks });
        }
      }
      
    } catch (e) {
      console.log(`Error: ${e.message.slice(0, 150)}`);
      results.push({ ...job, status: 'error', error: e.message.slice(0, 150) });
    }
    
    await page.close();
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Save
  fs.writeFileSync('/root/silent-giants/deliverables/direct-applications.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    results
  }, null, 2));
  
  console.log('\n=== SUMMARY ===');
  results.forEach(r => console.log(`${r.status}: ${r.title} @ ${r.company}`));
  
  await browser.close();
}

main();
