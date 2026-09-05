#!/usr/bin/env node
/**
 * Twitter DM Sender via Puppeteer (Render)
 * Sends DMs to target accounts without API
 */
import puppeteer from 'puppeteer';

const TARGETS = [
  { handle: 'SolanaLabs', msg: 'Hello! We\'re Silent Giants — Arabic Web3 content specialists. We write technical articles, educational threads, translations (EN→AR), and manage communities. Portfolio: 92+ completed tasks. Open for collaboration? 📧 auroraalmada4@gmail.com' },
  { handle: 'rendernetwork', msg: 'Hi Render team! We help Web3 projects reach Arabic audiences through content writing, EN→AR translation, and community management. 92+ tasks delivered. Payment: USDT/USDC. Interested? 📧 auroraalmada4@gmail.com' },
  { handle: 'ionet', msg: 'Hello! Silent Giants here — Arabic Web3 content team. We write articles, translations, and manage communities for DePIN projects. 92+ tasks. Available now. 📧 auroraalmada4@gmail.com' },
  { handle: 'NEARProtocol', msg: 'Hi NEAR team! We specialize in Arabic Web3 content: articles, translations, community management. 92+ tasks delivered. Open for collaboration? 📧 auroraalmada4@gmail.com' },
  { handle: 'CeloOrg', msg: 'Hello Celo! We\'re Silent Giants, offering Arabic content for mobile-first blockchain projects. Articles, translations, community management. 92+ tasks. 📧 auroraalmada4@gmail.com' },
  { handle: 'AstraDAO', msg: 'Hi AstraDAO! We provide Arabic DeFi content: articles, governance analysis, community management. 92+ tasks. Available immediately. 📧 auroraalmada4@gmail.com' },
  { handle: 'PundiXLabs', msg: 'Hello PundiX! We offer Arabic content for payment-focused blockchain projects. Technical articles, translations, community management. 92+ tasks. 📧 auroraalmada4@gmail.com' },
  { handle: 'avalabs', msg: 'Hi Avalanche team! We specialize in Arabic Web3 content for L1/L2 ecosystems. Articles, subnet documentation, community content. 92+ tasks. 📧 auroraalmada4@gmail.com' },
  { handle: 'alaborand', msg: 'Hello Algorand! We provide Arabic content for pure-proof-of-stake blockchains. Technical articles, ASA documentation, community management. 92+ tasks. 📧 auroraalmada4@gmail.com' },
  { handle: 'tezos', msg: 'Hi Tezos! We offer Arabic content for self-amending blockchains. Smart contract documentation, FA token articles, community content. 92+ tasks. 📧 auroraalmada4@gmail.com' }
];

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

(async () => {
  log('🚀 Starting Twitter DM campaign...');
  
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

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });

  // Check if Twitter login is available
  try {
    log('📄 Navigating to Twitter...');
    await page.goto('https://x.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    log(`📍 URL: ${page.url()}`);
    
    const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
    log(`📄 Page: ${pageText.slice(0, 150).replace(/\n/g, ' ')}`);
    
    // Check for login form
    const hasEmail = await page.$('input[type="text"], input[name="text"], input[autocomplete="username"]');
    if (hasEmail) {
      log('📧 Login form found — but no credentials available');
      log('⚠️ Cannot login without Twitter credentials');
    } else {
      log('⚠️ Login page not found or different layout');
    }
  } catch (e) {
    log(`❌ Twitter navigation failed: ${e.message}`);
  }

  await browser.close();
  
  log('\n📊 RESULT: Twitter DMs cannot be sent without login credentials');
  log('📋 ALTERNATIVE: Prepare messages for manual sending');
  
  // Output the messages for manual use
  console.log('\n__MESSAGES_START__');
  for (const t of TARGETS) {
    console.log(`TO: @${t.handle}`);
    console.log(`MSG: ${t.msg}`);
    console.log('---');
  }
  console.log('__MESSAGES_END__');
})();
