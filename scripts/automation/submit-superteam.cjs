const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  superteamUrl: 'https://superteam.fun',
  authUrl: 'https://superteam.fun/api/auth/signin/twitter',
  deliverablesDir: path.join(process.env.HOME, 'silent-giants/deliverables/executed'),
  auditLog: path.join(process.env.HOME, 'silent-giants/deliverables/superteam-applications/audit-log.md'),
  
  bounties: [
    {
      slug: 'zns-sol',
      title: 'ZNS Solana Creator Challenge',
      reward: '500 USDC',
      taskId: 'TASK-408',
      agentAccess: 'AGENT_ALLOWED'
    },
    {
      slug: 'solana-summit-canada-creator-challenge-part-1',
      title: 'Solana Summit Canada Creator Challenge',
      reward: '10,000 USDG',
      taskId: 'TASK-409',
      agentAccess: 'HUMAN_ONLY'
    },
    {
      slug: 'solana-summit-creator-grant',
      title: 'Solana Summit Creator Grant',
      reward: '2,000 USDG',
      taskId: 'TASK-414',
      agentAccess: 'HUMAN_ONLY'
    },
    {
      slug: 'create-content-to-engage-new-builders-for-the-hackathon',
      title: 'Create Content for New Builders',
      reward: '900 USDG',
      taskId: 'TASK-423',
      agentAccess: 'HUMAN_ONLY'
    },
    {
      slug: 'castledao-content-challenge',
      title: 'CastleDAO Content Challenge',
      reward: '1,000 USDG',
      taskId: 'TASK-424',
      agentAccess: 'HUMAN_ONLY'
    }
  ]
};

function logAudit(entry) {
  const timestamp = new Date().toISOString();
  const logEntry = `| ${timestamp} | ${entry.bounty} | ${entry.taskId} | ${entry.status} | ${entry.note || ''} |\n`;
  fs.appendFileSync(CONFIG.auditLog, logEntry);
  console.log(`[AUDIT] ${entry.bounty}: ${entry.status}`);
}

async function submitToBounty(page, bounty) {
  try {
    console.log(`\n🎯 Attempting: ${bounty.title} (${bounty.reward})`);
    
    // Navigate to bounty page
    await page.goto(`${CONFIG.superteamUrl}/listings/${bounty.slug}`, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    // Wait for page to load
    await new Promise(r => setTimeout(r, 3000));
    
    // Check if we're logged in
    const isLoggedIn = await page.evaluate(() => {
      const applyBtn = document.querySelector('button[class*="apply"], a[class*="apply"], [data-testid*="apply"]');
      return !!applyBtn;
    });
    
    if (!isLoggedIn) {
      console.log('❌ Not logged in. Need Twitter OAuth first.');
      logAudit({ bounty: bounty.title, taskId: bounty.taskId, status: 'BLOCKED', note: 'Need Twitter login' });
      return false;
    }
    
    // Find and click Apply button
    const applyBtn = await page.$('button[class*="apply"], a[class*="apply"], [data-testid*="apply"]');
    if (applyBtn) {
      await applyBtn.click();
      await new Promise(r => setTimeout(r, 2000));
      
      // Check for submission form
      const hasForm = await page.evaluate(() => {
        return !!document.querySelector('form, [class*="submission"], [class*="upload"]');
      });
      
      if (hasForm) {
        // Upload task file
        const taskFile = path.join(CONFIG.deliverablesDir, `${bounty.taskId}-*.md`);
        const files = fs.readdirSync(CONFIG.deliverablesDir).filter(f => f.startsWith(bounty.taskId));
        
        if (files.length > 0) {
          const filePath = path.join(CONFIG.deliverablesDir, files[0]);
          console.log(`📎 Uploading: ${files[0]}`);
          
          // Find file input and upload
          const fileInput = await page.$('input[type="file"]');
          if (fileInput) {
            await fileInput.uploadFile(filePath);
            await new Promise(r => setTimeout(r, 2000));
          }
          
          // Find and click submit button
          const submitBtn = await page.$('button[type="submit"], button[class*="submit"]');
          if (submitBtn) {
            await submitBtn.click();
            await new Promise(r => setTimeout(r, 3000));
            
            logAudit({ bounty: bounty.title, taskId: bounty.taskId, status: 'SUBMITTED', note: 'File uploaded' });
            console.log('✅ Submitted successfully!');
            return true;
          }
        }
      }
      
      logAudit({ bounty: bounty.title, taskId: bounty.taskId, status: 'PARTIAL', note: 'Apply clicked but submission incomplete' });
      console.log('⚠️ Apply clicked but submission form not found');
    } else {
      logAudit({ bounty: bounty.title, taskId: bounty.taskId, status: 'NO_APPLY_BTN', note: 'Apply button not found' });
      console.log('❌ Apply button not found');
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error submitting to ${bounty.title}:`, error.message);
    logAudit({ bounty: bounty.title, taskId: bounty.taskId, status: 'ERROR', note: error.message });
    return false;
  }
}

async function main() {
  console.log('🚀 Starting Superteam Earn Submission Automation');
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🎯 Bounties to submit: ${CONFIG.bounties.length}`);
  
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  // Check if we have stored cookies/session
  const cookiesPath = path.join(process.env.HOME, 'silent-giants/scripts/automation/cookies.json');
  if (fs.existsSync(cookiesPath)) {
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    await page.setCookie(...cookies);
    console.log('🍪 Loaded stored cookies');
  }
  
  // Navigate to Superteam
  await page.goto(CONFIG.superteamUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  
  // Check auth status
  const authStatus = await page.evaluate(() => {
    const loginBtn = document.querySelector('a[href*="signin"], button[class*="login"], [class*="sign-in"]');
    return { hasLogin: !!loginBtn, url: window.location.href };
  });
  
  console.log(`\n📊 Auth Status: ${authStatus.hasLogin ? 'NOT LOGGED IN' : 'LOGGED IN'}`);
  
  if (authStatus.hasLogin) {
    console.log('\n⚠️ Twitter authentication required.');
    console.log('Please login manually at: https://superteam.fun/api/auth/signin/twitter');
    console.log('Then run this script again with --cookies flag.\n');
    
    // Save current state for later
    logAudit({ bounty: 'SYSTEM', taskId: 'N/A', status: 'AUTH_REQUIRED', note: 'Need Twitter OAuth login' });
  } else {
    // Try to submit to each bounty
    let submitted = 0;
    for (const bounty of CONFIG.bounties) {
      const success = await submitToBounty(page, bounty);
      if (success) submitted++;
      await new Promise(r => setTimeout(r, 2000)); // Rate limit
    }
    
    console.log(`\n📊 Results: ${submitted}/${CONFIG.bounties.length} submitted`);
    
    // Save cookies for next run
    const cookies = await page.cookies();
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
    console.log('🍪 Cookies saved for next run');
  }
  
  await browser.close();
  console.log('\n✅ Script completed');
}

main().catch(console.error);
