#!/usr/bin/env node
/**
 * Superteam Earn Browser Submission via Puppeteer
 * Works on Render (x86_64) with bundled Chromium
 *
 * Uses Puppeteer-native selectors only (no Playwright :has-text()).
 * Robust login detection (OAuth vs email/password).
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const SUPERTEAM_EMAIL = process.env.SUPERTEAM_EMAIL || 'auroraalmada4@gmail.com';
const SUPERTEAM_PASSWORD = process.env.SUPERTEAM_PASSWORD || '';
const GITHUB_URL = 'https://github.com/mohammadassia993-jpg/aurora-bot-render';
const RESULTS_FILE = path.join(import.meta.dirname, '..', 'deliverables', 'reports', 'puppeteer-submissions.json');
const AUDIT_LOG = path.join(import.meta.dirname, '..', 'logs', 'audit.log');

const BOUNTIES = [
  { id: 'ba37dab1-ee5c-4817-b016-5faeb28acc14', title: 'Polish Solana Research', prize: '600 USDC', slug: 'polish-solana-ecosystem-research-content-bounty' },
  { id: '9a42cdbf-f931-4560-9663-99afe37e5656', title: 'Not Your Regular Bounty', prize: '3000 jupUSD', slug: 'not-your-regular-bounty' },
  { id: '7eca6bb4-72d6-4cb2-aed9-4c88ca085c40', title: 'Imperial AI Agent Hackathon', prize: '5000 USDG', slug: 'imperial-ai-agent-hackathon-build-the-agent-economy' },
  { id: '70678a7e-fbce-4566-a2a1-879ab57fc316', title: 'Superteam Brazil LMS', prize: '5000 USDG', slug: 'superteam-academy' },
  { id: 'efd39767-65cf-4183-a96b-7711080e7db3', title: 'Rebuild Backend Rust', prize: '1000 USDC', slug: 'rebuild-production-backend-systems-as-on-chain-rust-programs' },
  { id: '88dbbf01-99b7-4751-8750-48f7941e7dc2', title: 'Poland Podcast Cover', prize: '500 USDC', slug: 'superteam-poland-podcast-cover-design' },
  { id: 'fd499139-21a9-443d-a0fc-cb418f646f0d', title: 'Narrative Detection Tool', prize: '3500 USDG', slug: 'develop-a-narrative-detection-and-idea-generation-tool' },
  { id: '4b408d2a-a09e-4584-b0e1-9bd534c23054', title: 'Audit Solana Repos', prize: '3000 USDG', slug: 'fix-open-source-solana-repos-agents' },
  { id: 'c3fc3838-b6a1-4eef-a0b5-73fcb103bd6d', title: 'Open Innovation Track', prize: '5000 USDG', slug: 'open-innovation-track-agents' },
];

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function audit(msg) {
  try { fs.appendFileSync(AUDIT_LOG, `[${new Date().toISOString()}] PUPPETEER: ${msg}\n`); } catch {}
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function saveResults(results) {
  try {
    fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
    fs.writeFileSync(RESULTS_FILE, JSON.stringify({
      timestamp: new Date().toISOString(),
      total: BOUNTIES.length,
      success: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      results
    }, null, 2));
  } catch (e) { log(`⚠️ Could not save results: ${e.message}`); }
}

/**
 * Find an element by its text content using page.evaluate (Puppeteer-safe).
 * Returns whether a clickable element with the given text exists.
 */
async function clickButtonByText(page, texts) {
  const found = await page.evaluate((targets) => {
    const nodes = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const t = targets.map(s => s.toLowerCase());
    for (const node of nodes) {
      const txt = (node.textContent || '').trim().toLowerCase();
      if (t.some(s => txt.includes(s))) {
        node.click();
        return true;
      }
    }
    return false;
  }, texts);
  return found;
}

async function getPageText(page) {
  try {
    return await page.evaluate(() => document.body ? document.body.innerText.slice(0, 2000) : '');
  } catch { return ''; }
}

(async () => {
  if (!SUPERTEAM_PASSWORD) {
    log('❌ SUPERTEAM_PASSWORD not set!');
    audit('FAILED: SUPERTEAM_PASSWORD not set');
    process.exit(1);
  }

  log('🚀 Starting Puppeteer submission...');
  log(`📧 Email: ${SUPERTEAM_EMAIL}`);
  log(`🎯 Bounties: ${BOUNTIES.length}`);
  audit(`Starting submission for ${BOUNTIES.length} bounties`);

  // ---- CHOOSE CHROME EXECUTABLE PATH ----
  let browser;
  try {
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--window-size=1280,800'
      ],
      timeout: 30000
    };
    // On Render, puppeteer may need explicit executable path
    const env = process.env;
    if (env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = env.PUPPETEER_EXECUTABLE_PATH;
    }
    browser = await puppeteer.launch(launchOptions);
    log('✅ Browser launched');
  } catch (launchErr) {
    log(`❌ Browser launch failed: ${launchErr.message}`);
    audit(`FAILED: Browser launch: ${launchErr.message}`);
    await saveResults(BOUNTIES.map(b => ({ ...b, status: 'failed', error: 'browser_launch_failed' })));
    process.exit(1);
  }

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });

  const results = [];

  try {
    // ============ STEP 1: LOGIN ============
    log('🔐 Navigating to Superteam...');
    await page.goto('https://superteam.fun/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(4000);
    log(`📍 URL after load: ${page.url()}`);
    let pageText = await getPageText(page);
    log(`📄 Page sample: ${pageText.slice(0, 120).replace(/\n/g, ' ')}`);

    // Detect if we're logged in already
    const loggedIn = await page.evaluate(() => {
      const body = document.body ? document.body.innerText : '';
      return /sign in|log in|welcome back/i.test(body) === false;
    });

    if (!loggedIn) {
      // Try to find login page / button
      log('🔐 Not logged in. Attempting login...');
      const loginClicked = await clickButtonByText(page, ['sign in', 'log in', 'login', 'connect wallet']);
      if (loginClicked) {
        log('  👉 Clicked login button');
        await sleep(5000);
      } else {
        log('  ⚠️ Login button not found on homepage');
      }

      pageText = await getPageText(page);
      log(`📍 URL after login click: ${page.url()}`);

      // Try email/password login form
      try {
        const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
        const passInput = await page.$('input[type="password"], input[name="password"], input[placeholder*="password" i]');
        if (emailInput && passInput) {
          log('  📧 Email/password form found — filling...');
          await emailInput.click({ clickCount: 3 });
          await emailInput.type(SUPERTEAM_EMAIL, { delay: 30 });
          await passInput.click({ clickCount: 3 });
          await passInput.type(SUPERTEAM_PASSWORD, { delay: 30 });
          await sleep(500);
          const submitClicked = await clickButtonByText(page, ['sign in', 'log in', 'login', 'submit', 'continue']);
          log(`  👉 Submit clicked: ${submitClicked}`);
          await sleep(6000);
          log(`📍 URL after login: ${page.url()}`);
        } else {
          log('  ⚠️ No email/password form. Likely OAuth login (Discord/GitHub).');
        }
      } catch (e) {
        log(`  ⚠️ Login form error: ${e.message}`);
      }
    } else {
      log('✅ Already logged in.');
    }

    // ============ STEP 2: SUBMIT TO EACH BOUNTY ============
    for (let i = 0; i < BOUNTIES.length; i++) {
      const bounty = BOUNTIES[i];
      log(`\n📝 [${i+1}/${BOUNTIES.length}] ${bounty.title} (${bounty.prize})...`);

      try {
        const url = `https://superteam.fun/earn/listing/${bounty.slug}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await sleep(4000);
        const listingText = await getPageText(page);
        log(`  📄 Listing page sample: ${listingText.slice(0, 150).replace(/\n/g, ' ')}`);

        // Look for Apply / Submit / Apply now button
        const applyClicked = await clickButtonByText(page, ['apply now', 'apply', 'submit', 'apply for this bounty', 'start']);
        if (applyClicked) {
          log('  👉 Apply clicked');
          await sleep(4000);

          // Fill link field (GitHub repo)
          try {
            const linkInput = await page.$('input[name="link"], input[placeholder*="link" i], input[placeholder*="url" i], input[name="github"], input[name="applicationLink"]');
            if (linkInput) {
              await linkInput.click({ clickCount: 3 });
              await linkInput.type(GITHUB_URL, { delay: 25 });
              log('  🔗 Link entered');
            }
          } catch (e) { log(`  ⚠️ Link field: ${e.message}`); }

          // Fill textarea / info
          try {
            const infoField = await page.$('textarea[name="otherInfo"], textarea[placeholder*="info" i], textarea[name="description"], textarea');
            if (infoField) {
              await infoField.click({ clickCount: 3 });
              await infoField.type('Arabic Web3 content samples (92 deliverables): articles, translations, analyses, courses, and submission packages. Full portfolio available on GitHub.', { delay: 15 });
              log('  📝 Info entered');
            }
          } catch (e) { log(`  ⚠️ Info field: ${e.message}`); }

          await sleep(1000);

          // Click final submit button
          const finalSubmit = await clickButtonByText(page, ['submit', 'submit application', 'send', 'confirm']);
          if (finalSubmit) {
            await sleep(4000);
            results.push({ ...bounty, status: 'success', timestamp: new Date().toISOString() });
            log('  ✅ Submitted!');
            audit(`SUCCESS: ${bounty.title}`);
          } else {
            // Maybe form already submitted or button text different
            results.push({ ...bounty, status: 'partial', message: 'apply clicked but final submit not found', timestamp: new Date().toISOString() });
            log('  ⚠️ Apply clicked but final submit button not found');
          }
        } else {
          // No apply button => likely not logged in or page structure different
          const pageTxt = await getPageText(page);
          if (/sign in|log in/i.test(pageTxt)) {
            results.push({ ...bounty, status: 'auth_required', message: 'login needed', timestamp: new Date().toISOString() });
            log('  🔒 Login required (OAuth) — cannot auto-submit');
          } else {
            results.push({ ...bounty, status: 'no_apply', message: 'apply button not found', timestamp: new Date().toISOString() });
            log('  ⏭️ No Apply button found');
          }
        }
      } catch (e) {
        results.push({ ...bounty, status: 'failed', error: e.message, timestamp: new Date().toISOString() });
        log(`  ❌ Error: ${e.message}`);
        audit(`FAILED: ${bounty.title} — ${e.message}`);
      }

      await sleep(3000);
    }
  } catch (e) {
    log(`❌ Fatal: ${e.message}`);
    audit(`FATAL: ${e.message}`);
  } finally {
    await browser.close();
  }

  await saveResults(results);

  const s = results.filter(r => r.status === 'success').length;
  const f = results.filter(r => r.status === 'failed').length;
  const k = results.filter(r => ['skipped', 'no_apply', 'auth_required', 'partial'].includes(r.status)).length;

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('📊 RESULTS');
  log(`✅ Success: ${s}/${BOUNTIES.length}`);
  log(`❌ Failed: ${f}`);
  log(`⏭️ Other (skipped/auth/partial): ${k}`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  audit(`COMPLETED: ${s} success, ${f} failed, ${k} other / ${BOUNTIES.length}`);

  // Output JSON summary for easy parsing
  console.log('\n__JSON_START__' + JSON.stringify({ success: s, failed: f, other: k, total: BOUNTIES.length, results }) + '__JSON_END__');
})();
