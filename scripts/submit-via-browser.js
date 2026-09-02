#!/usr/bin/env node
/**
 * Superteam Earn Browser Submission via Puppeteer
 * Runs on Render (x86_64) — NOT on ARM64 devices
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
  { id: 'ba37dab1-ee5c-4817-b016-5faeb28acc14', title: 'Polish Solana Ecosystem Research', prize: '600 USDC', slug: 'polish-solana-ecosystem-research-content-bounty' },
  { id: '9a42cdbf-f931-4560-9663-99afe37e5656', title: 'Not Your Regular Bounty', prize: '3000 jupUSD', slug: 'not-your-regular-bounty' },
  { id: '7eca6bb4-72d6-4cb2-aed9-4c88ca085c40', title: 'Imperial AI Agent Hackathon', prize: '5000 USDG', slug: 'imperial-ai-agent-hackathon-build-the-agent-economy' },
  { id: '70678a7e-fbce-4566-a2a1-879ab57fc316', title: 'Superteam Brazil LMS dApp', prize: '5000 USDG', slug: 'superteam-academy' },
  { id: 'efd39767-65cf-4183-a96b-7711080e7db3', title: 'Rebuild Backend as Rust', prize: '1000 USDC', slug: 'rebuild-production-backend-systems-as-on-chain-rust-programs' },
  { id: '88dbbf01-99b7-4751-8750-48f7941e7dc2', title: 'Poland Podcast Cover Design', prize: '500 USDC', slug: 'superteam-poland-podcast-cover-design' },
  { id: 'fd499139-21a9-443d-a0fc-cb418f646f0d', title: 'Narrative Detection Tool', prize: '3500 USDG', slug: 'develop-a-narrative-detection-and-idea-generation-tool' },
  { id: '4b408d2a-a09e-4584-b0e1-9bd534c23054', title: 'Audit Solana Repos', prize: '3000 USDG', slug: 'fix-open-source-solana-repos-agents' },
  { id: 'c3fc3838-b6a1-4eef-a0b5-73fcb103bd6d', title: 'Open Innovation Track', prize: '5000 USDG', slug: 'open-innovation-track-agents' },
];

function logAudit(message) {
  const entry = `[${new Date().toISOString()}] PUPPETEER_SUBMIT: ${message}\n`;
  fs.appendFileSync(AUDIT_LOG, entry);
  console.log(message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function saveResults(results) {
  fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify({
    timestamp: new Date().toISOString(),
    total: BOUNTIES.length,
    success: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    results
  }, null, 2));
}

(async () => {
  if (!SUPERTEAM_PASSWORD) {
    console.error('❌ SUPERTEAM_PASSWORD not set in environment variables!');
    console.error('Please set it in Render Environment Variables.');
    process.exit(1);
  }

  console.log('🚀 Starting Puppeteer submission on Superteam Earn...');
  console.log(`📧 Email: ${SUPERTEAM_EMAIL}`);
  console.log(`🎯 Bounties to submit: ${BOUNTIES.length}`);
  console.log('');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const results = [];

  try {
    // Step 1: Login to Superteam
    logAudit('🔐 Navigating to Superteam login...');
    await page.goto('https://superteam.fun/login', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    // Check if we're on login page
    const loginUrl = page.url();
    console.log(`📍 Current URL: ${loginUrl}`);

    // Try email/password login
    try {
      // Look for email input
      const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email"]');
      if (emailInput) {
        await emailInput.type(SUPERTEAM_EMAIL);
        console.log('📧 Email entered');
      }

      // Look for password input
      const passwordInput = await page.$('input[type="password"], input[name="password"]');
      if (passwordInput) {
        await passwordInput.type(SUPERTEAM_PASSWORD);
        console.log('🔑 Password entered');
      }

      // Click login button
      const loginButton = await page.$('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")');
      if (loginButton) {
        await loginButton.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        console.log('✅ Login submitted');
      }
    } catch (loginError) {
      console.log(`⚠️ Login attempt: ${loginError.message}`);
    }

    await sleep(3000);
    const afterLoginUrl = page.url();
    console.log(`📍 After login URL: ${afterLoginUrl}`);

    // Step 2: Submit to each bounty
    for (const bounty of BOUNTIES) {
      console.log(`\n📝 Submitting to: ${bounty.title} (${bounty.prize})...`);
      logAudit(`Attempting submission: ${bounty.title}`);

      try {
        const listingUrl = `https://superteam.fun/earn/listing/${bounty.slug}`;
        await page.goto(listingUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(2000);

        const currentUrl = page.url();
        console.log(`  📍 URL: ${currentUrl}`);

        // Try to find and click Apply button
        const applyButton = await page.$('button:has-text("Apply"), button:has-text("Submit"), a:has-text("Apply")');
        if (applyButton) {
          await applyButton.click();
          await sleep(2000);

          // Fill in submission form if it appears
          const linkInput = await page.$('input[name="link"], input[placeholder*="link"], input[placeholder*="URL"]');
          if (linkInput) {
            await linkInput.type(GITHUB_URL);
            console.log('  🔗 Link entered');
          }

          const infoInput = await page.$('textarea[name="otherInfo"], textarea[placeholder*="info"]');
          if (infoInput) {
            await infoInput.type('Arabic Web3 content - 92 deliverables including articles, translations, security reviews');
            console.log('  📝 Info entered');
          }

          // Submit
          const submitBtn = await page.$('button[type="submit"]:has-text("Submit"), button[type="submit"]:has-text("Apply")');
          if (submitBtn) {
            await submitBtn.click();
            await sleep(3000);
            results.push({ ...bounty, status: 'success', timestamp: new Date().toISOString() });
            console.log(`  ✅ Submitted successfully!`);
            logAudit(`SUCCESS: ${bounty.title}`);
          } else {
            results.push({ ...bounty, status: 'partial', message: 'Applied but submit button not found', timestamp: new Date().toISOString() });
            console.log(`  ⚠️ Applied but submit button not found`);
          }
        } else {
          results.push({ ...bounty, status: 'skipped', message: 'Apply button not found', timestamp: new Date().toISOString() });
          console.log(`  ⏭️ Apply button not found — skipped`);
        }
      } catch (bountyError) {
        results.push({ ...bounty, status: 'failed', error: bountyError.message, timestamp: new Date().toISOString() });
        console.log(`  ❌ Error: ${bountyError.message}`);
        logAudit(`FAILED: ${bounty.title} — ${bountyError.message}`);
      }

      await sleep(3000); // Rate limit between submissions
    }

  } catch (error) {
    console.error(`❌ Fatal error: ${error.message}`);
    logAudit(`FATAL: ${error.message}`);
  } finally {
    await browser.close();
  }

  // Save results
  await saveResults(results);

  // Summary
  const successCount = results.filter(r => r.status === 'success').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 FINAL RESULTS');
  console.log(`✅ Success: ${successCount}/${BOUNTIES.length}`);
  console.log(`❌ Failed: ${failedCount}`);
  console.log(`⏭️ Skipped: ${skippedCount}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  logAudit(`COMPLETED: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped out of ${BOUNTIES.length}`);
})();
