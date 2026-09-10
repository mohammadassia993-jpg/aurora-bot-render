import { chromium } from 'playwright';
import fs from 'node:fs';

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const results = [];

const jobs = [
  {
    title: 'Freelance Writer',
    company: 'IAPWE',
    url: 'https://remotive.com/remote-jobs/writing/freelance-writer-1185979',
    source: 'remotive'
  },
  {
    title: 'Freelance Copywriter',
    company: 'Coalition Technologies',
    url: 'https://remotive.com/remote-jobs/writing/freelance-copywriter-1749306',
    source: 'remotive'
  },
  {
    title: 'AI Response Analyst',
    company: 'iMerit Technology',
    url: 'https://remoteOK.com/remote-jobs/remote-ai-response-analyst-imerit-technology-11',
    source: 'remoteok'
  },
  {
    title: 'Social Comms',
    company: 'NOPE',
    url: 'https://remoteOK.com/remote-jobs/remote-social-comms-nope-1137314',
    source: 'remoteok'
  },
  {
    title: 'Head of Marketing & Communications',
    company: 'garden3d',
    url: 'https://remotive.com/remote-jobs/marketing/head-of-marketing-communications-2091',
    source: 'remotive'
  },
  {
    title: 'Course Writer and Editor',
    company: 'Interaction Design Foundation',
    url: 'https://remoteOK.com/remote-jobs/remote-course-writer-and-editor-ux-ui',
    source: 'remoteok'
  }
];

async function applyToJob(page, job) {
  console.log(`\n--- Applying: ${job.title} @ ${job.company} ---`);
  
  try {
    await page.goto(job.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    
    const body = await page.evaluate(() => document.body?.innerText || '');
    console.log('Page loaded, body length:', body.length);
    
    // Find "Apply" button/link
    const applyBtn = await page.$('a:has-text("Apply"), button:has-text("Apply"), a:has-text("apply"), a[href*="apply"]');
    if (applyBtn) {
      const href = await applyBtn.evaluate(b => b.href || '');
      const text = await applyBtn.evaluate(b => b.innerText?.trim() || '');
      console.log(`Found apply button: "${text}" → ${href.slice(0, 100)}`);
      
      // If it's a link to external site, navigate there
      if (href && href.includes('http') && !href.includes('remotive') && !href.includes('remoteok')) {
        console.log(`External apply URL: ${href}`);
        results.push({ ...job, status: 'external_apply_url', applyUrl: href });
        return;
      }
      
      // Click the apply button
      await applyBtn.click();
      await page.waitForTimeout(5000);
      
      const newUrl = page.url();
      const newBody = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
      console.log('After click URL:', newUrl);
      console.log('After click body:', newBody.slice(0, 200));
      
      // Check if form appeared
      const hasForm = await page.$('form');
      if (hasForm) {
        console.log('Form found! Checking fields...');
        const inputs = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select')).map(i => ({
            type: i.type, name: i.name, placeholder: i.placeholder, id: i.id
          }));
        });
        console.log('Form fields:', JSON.stringify(inputs.slice(0, 10)));
        
        // Try to fill email field
        const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email"]');
        if (emailInput) {
          await emailInput.fill('auroraalmada4@gmail.com');
          console.log('Filled email');
        }
        
        // Try to fill name field
        const nameInput = await page.$('input[name="name"], input[placeholder*="name"]');
        if (nameInput) {
          await nameInput.fill('Silent Giants');
          console.log('Filled name');
        }
        
        // Try to fill message/cover letter
        const msgInput = await page.$('textarea, input[name="message"], input[name="cover_letter"]');
        if (msgInput) {
          await msgInput.fill('Hello, I am a Web3 content specialist with 92+ completed tasks. I specialize in Arabic/English technical writing, translations, and blockchain content. Available immediately. USDT/USDC payment preferred.');
          console.log('Filled message');
        }
        
        // Submit
        const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(5000);
          const afterSubmit = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
          console.log('After submit:', afterSubmit.slice(0, 200));
          results.push({ ...job, status: 'submitted', response: afterSubmit.slice(0, 200) });
        } else {
          results.push({ ...job, status: 'form_found_no_submit' });
        }
      } else {
        // Might be email link
        const emailLink = await page.$('a[href^="mailto:"]');
        if (emailLink) {
          const email = await emailLink.evaluate(b => b.href.replace('mailto:', ''));
          console.log('Email found:', email);
          results.push({ ...job, status: 'email_found', email });
        } else {
          results.push({ ...job, status: 'apply_clicked_no_form', url: newUrl });
        }
      }
    } else {
      // Check for email link
      const emailLink = await page.$('a[href^="mailto:"]');
      if (emailLink) {
        const email = await emailLink.evaluate(b => b.href.replace('mailto:', ''));
        console.log('Email found:', email);
        results.push({ ...job, status: 'email_found', email });
      } else {
        // Dump all links for debugging
        const allLinks = await page.evaluate(() => Array.from(document.querySelectorAll('a')).filter(a => a.innerText?.toLowerCase().includes('apply')).map(a => ({ text: a.innerText?.trim(), href: a.href })));
        console.log('Apply-related links:', JSON.stringify(allLinks));
        results.push({ ...job, status: 'no_apply_button', links: allLinks });
      }
    }
  } catch (e) {
    console.log(`Error: ${e.message.slice(0, 200)}`);
    results.push({ ...job, status: 'error', error: e.message.slice(0, 200) });
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  
  for (const job of jobs) {
    await applyToJob(page, job);
    await new Promise(r => setTimeout(r, 3000));
  }
  
  // Save results
  fs.writeFileSync('/root/silent-giants/deliverables/actual-applications.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    total: results.length,
    submitted: results.filter(r => r.status === 'submitted').length,
    email_found: results.filter(r => r.status === 'email_found').length,
    external: results.filter(r => r.status === 'external_apply_url').length,
    errors: results.filter(r => r.status === 'error').length,
    results
  }, null, 2));
  
  console.log('\n=== FINAL RESULTS ===');
  results.forEach(r => console.log(`${r.status}: ${r.title} @ ${r.company}`));
  console.log(`\nSubmitted: ${results.filter(r => r.status === 'submitted').length}`);
  console.log(`Emails found: ${results.filter(r => r.status === 'email_found').length}`);
  console.log(`External URLs: ${results.filter(r => r.status === 'external_apply_url').length}`);
  
  await browser.close();
}

main();
