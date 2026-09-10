import { chromium } from 'playwright';
import fs from 'node:fs';

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';
const results = [];

const applications = [
  {
    title: 'Freelance Writer',
    company: 'IAPWE',
    url: 'https://iapwe.org/remotive',
    email: 'auroraalmada4@gmail.com'
  },
  {
    title: 'Freelance Copywriter',
    company: 'Coalition Technologies',
    url: 'https://app.testedrecruits.com/posting/16720',
    email: 'auroraalmada4@gmail.com'
  },
  {
    title: 'Content Reviewer',
    company: 'TELUS Digital',
    url: 'https://www.telusinternational.ai/cmp/contributor/jobs/available/128949?utm_source=Remotive&utm_medium=Ads&utm_campaign=SHTArlyn_AMERICAS_Paid+Site_Remotive_Ads_128949_',
    email: 'auroraalmada4@gmail.com'
  }
];

const COVER_LETTER = `Hello,

I am writing to express my interest in this position. As a member of Silent Giants, a Web3 content team with 92+ completed tasks spanning Arabic/English content, translations, and technical analysis, I bring a unique blend of skills.

Key qualifications:
• Arabic/English technical writing for Web3 and blockchain
• Content creation for DeFi, DePIN, and DAO topics
• Fast turnaround (24-72 hours for most deliverables)
• USDT/USDC payment preferred (wallets: Binance, Zengo, Phantom)

Portfolio highlights:
- 9 Web3 explainer articles (Arabic)
- 4 technical translations (EN→AR)
- 6 educational courses on blockchain topics
- 10 marketing templates for crypto projects
- 7 digital products on Gumroad

I am available for immediate start and can commit to 20+ hours/week.

Best regards,
Silent Giants Team
Email: auroraalmada4@gmail.com
Telegram: @Aurora_Almada_88_Bot`;

async function applyToSite(page, app) {
  console.log(`\n=== ${app.title} @ ${app.company} ===`);
  console.log(`URL: ${app.url}`);
  
  try {
    await page.goto(app.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 800) || '');
    console.log('Page body:', body.slice(0, 400));
    
    // Find all form fields
    const fields = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select')).map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder, id: i.id, label: i.labels?.[0]?.innerText || ''
      }));
    });
    console.log('Form fields:', JSON.stringify(fields.slice(0, 15)));
    
    // Fill email
    const emailInput = await page.$('input[type="email"], input[name*="email"], input[placeholder*="email" i]');
    if (emailInput) {
      await emailInput.fill(app.email);
      console.log('✅ Filled email');
    }
    
    // Fill name
    const nameInput = await page.$('input[name*="name" i]:not([type="email"]), input[placeholder*="name" i]');
    if (nameInput) {
      await nameInput.fill('Silent Giants');
      console.log('✅ Filled name');
    }
    
    // Fill cover letter/message
    const msgInput = await page.$('textarea, input[name*="message" i], input[name*="cover" i]');
    if (msgInput) {
      await msgInput.fill(COVER_LETTER);
      console.log('✅ Filled cover letter');
    }
    
    // Fill resume URL (if there's a field for it)
    const resumeInput = await page.$('input[name*="resume" i], input[name*="cv" i], input[name*="portfolio" i]');
    if (resumeInput) {
      await resumeInput.fill('https://auroradreams65.gumroad.com');
      console.log('✅ Filled resume/portfolio URL');
    }
    
    await page.waitForTimeout(1000);
    
    // Submit
    const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Apply"), button:has-text("Send")');
    if (submitBtn) {
      const btnText = await submitBtn.evaluate(b => b.innerText?.trim() || b.value || '');
      console.log(`Clicking submit: "${btnText}"`);
      await submitBtn.click();
      await page.waitForTimeout(8000);
      
      const afterUrl = page.url();
      const afterBody = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
      console.log('After submit URL:', afterUrl);
      console.log('After submit body:', afterBody.slice(0, 200));
      
      const success = afterBody.includes('thank') || afterBody.includes('success') || afterBody.includes('submitted') || afterBody.includes('received');
      results.push({ ...app, status: success ? 'submitted' : 'submit_clicked', body: afterBody.slice(0, 200) });
      console.log(success ? '✅ SUBMITTED!' : '⚠️ Submit clicked but unclear result');
    } else {
      console.log('No submit button found');
      results.push({ ...app, status: 'no_submit_button', fields });
    }
    
  } catch (e) {
    console.log(`Error: ${e.message.slice(0, 200)}`);
    results.push({ ...app, status: 'error', error: e.message.slice(0, 200) });
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
  
  for (const app of applications) {
    await applyToSite(page, app);
    await new Promise(r => setTimeout(r, 3000));
  }
  
  fs.writeFileSync('/root/silent-giants/deliverables/submitted-applications.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    total: results.length,
    submitted: results.filter(r => r.status === 'submitted').length,
    results
  }, null, 2));
  
  console.log('\n=== FINAL RESULTS ===');
  results.forEach(r => console.log(`${r.status}: ${r.title} @ ${r.company}`));
  
  await browser.close();
}

main();
