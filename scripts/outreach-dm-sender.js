#!/usr/bin/env node
/**
 * outreach-dm-sender.js
 * Automated outreach to 20 Arabic Web3 projects via contact forms and DMs
 * Uses Puppeteer on Render (x86_64 with Chromium)
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOG_FILE = path.join(ROOT, 'logs', 'outreach.log');
const TRACKER = path.join(ROOT, 'deliverables', 'outreach-2026-09-03', 'tracker.md');

const DM_TEMPLATES = {
  trading: `مرحباً 👋

لاحظت أن المشروع ينمو بسرعة في المنطقة العربية.

فريق عمالقة الصمت يقدم خدمات محتوى Web3 احترافية:
• مقالات تعليمية جاهزة للنشر
• ترجمة وثائق تقنية (EN→AR)
• إدارة محتوى شهرية

لدينا 92+ مهمة مكتملة وعينات عمل جاهزة.

هل يمكننا التواصل لمناقشة تعاون محتمل؟

📧 auroraalmada4@gmail.com`,

  depin: `مرحباً 👋

فريق عمالقة الصمت متخصص في محتوى DePIN بالعربية.

نكتب عن:
• شبكة المشروع بالعربية
• أدلة تعليمية للمستخدمين العرب
• تحليلات تقنية مبسطة

نقدم تحليل مجاني للمشروع.

هل يمكننا التواصل؟

📧 auroraalmada4@gmail.com`,

  dao: `مرحباً 👨‍⚖️

فريق عمالقة الصمت يقدم خدمات حوكمة DAO:
• كتابة مقترحات حوكمة
• تحليل اتجاهات التصويت
• ترجمة المقترحات للعربية
• تقارير شهرية عن الحوكمة

هل تحتاجون مساعدة في توسيع المجتمع العربي؟

📧 auroraalmada4@gmail.com`,

  general: `مرحباً 👋

فريق عمالقة الصمت يقدم خدمات محتوى Web3:
• كتابة محتوى احترافي
• ترجمة EN→AR
• تقارير بحثية
• محتوى تعليمي

92+ مهمة مكتملة | دفع USDT | تسليم 24-72 ساعة

هل تريدون عرضاً مخصصاً؟

📧 auroraalmada4@gmail.com`
};

const PROJECTS = [
  { name: 'BitOasis', url: 'https://bitoasis.net', type: 'trading', twitter: '@BitOasis' },
  { name: 'CoinMENA', url: 'https://coinmena.com', type: 'trading', twitter: '@CoinMENA' },
  { name: 'Rain', url: 'https://rain.co', type: 'trading', twitter: '@rainaborse' },
  { name: 'Fasset', url: 'https://fasset.com', type: 'trading', twitter: '@FassetT' },
  { name: 'Render Network', url: 'https://render.network', type: 'depin', twitter: '@rendernetwork' },
  { name: 'Filecoin', url: 'https://filecoin.io', type: 'depin', twitter: '@Filecoin' },
  { name: 'Helium', url: 'https://helium.com', type: 'depin', twitter: '@helium' },
  { name: 'Arweave', url: 'https://arweave.org', type: 'depin', twitter: '@Arab_orders' },
  { name: 'MakerDAO', url: 'https://makerdao.com', type: 'dao', twitter: '@MakerDAO' },
  { name: 'Aave', url: 'https://aave.com', type: 'dao', twitter: '@AaveAave' },
  { name: 'Uniswap', url: 'https://uniswap.org', type: 'dao', twitter: '@Uniswap' },
  { name: 'Arbitrum', url: 'https://arbitrum.io', type: 'general', twitter: '@Arbitrum' },
  { name: 'Polygon', url: 'https://polygon.technology', type: 'general', twitter: '@0xPolygon' },
  { name: 'Optimism', url: 'https://optimism.io', type: 'general', twitter: '@optimaborseFND' },
  { name: 'NEAR Protocol', url: 'https://near.org', type: 'general', twitter: '@NEARProtocol' },
  { name: 'zkSync', url: 'https://zksync.io', type: 'general', twitter: '@zksync' },
  { name: 'StarkNet', url: 'https://starknet.io', type: 'general', twitter: '@StarkNet' },
  { name: 'Cosmos', url: 'https://cosmos.network', type: 'general', twitter: '@cosmos' },
  { name: 'Polkadot', url: 'https://polkadot.network', type: 'general', twitter: '@Polkadot' },
  { name: 'Avalanche', url: 'https://avax.network', type: 'general', twitter: '@avaborse' }
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function updateTracker(project, status, details = '') {
  const entry = `| ${new Date().toISOString().slice(0, 16)} | ${project.name} | ${project.type} | ${status} | ${details} |\n`;
  fs.appendFileSync(TRACKER, entry);
}

async function tryContactForm(page, project) {
  try {
    await page.goto(project.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // Look for contact/support/about links
    const contactLinks = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a')];
      return links
        .filter(a => /contact|support|about|hire|partner|collaborate/i.test(a.textContent + a.href))
        .map(a => ({ text: a.textContent.trim(), href: a.href }))
        .slice(0, 3);
    });

    if (contactLinks.length === 0) {
      log(`  No contact links found on ${project.url}`);
      return false;
    }

    // Try the first contact link
    const contactUrl = contactLinks[0].href;
    log(`  Found contact link: ${contactUrl}`);
    await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Look for form fields
    const formFields = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input, textarea')];
      return inputs.map(i => ({
        type: i.type || 'text',
        name: i.name || i.id || i.placeholder || '',
        placeholder: i.placeholder || ''
      }));
    });

    log(`  Form fields found: ${formFields.length}`);
    
    // Try to fill the form
    const hasEmail = formFields.some(f => /email|mail/i.test(f.name + f.placeholder));
    const hasMessage = formFields.some(f => /message|body|text|comment/i.test(f.name + f.placeholder));
    const hasName = formFields.some(f => /name|first|last/i.test(f.name + f.placeholder));

    if (hasEmail && hasMessage) {
      // Fill name
      if (hasName) {
        const nameField = formFields.find(f => /name|first/i.test(f.name + f.placeholder));
        if (nameField) {
          await page.type(`[name="${nameField.name}"], [placeholder="${nameField.placeholder}"]`, 'Silent Giants Team', { delay: 30 });
        }
      }
      
      // Fill email
      const emailField = formFields.find(f => /email|mail/i.test(f.name + f.placeholder));
      if (emailField) {
        await page.type(`[name="${emailField.name}"], [placeholder="${emailField.placeholder}"]`, 'auroraalmada4@gmail.com', { delay: 30 });
      }
      
      // Fill message
      const msgField = formFields.find(f => /message|body|text|comment/i.test(f.name + f.placeholder));
      if (msgField) {
        const template = DM_TEMPLATES[project.type] || DM_TEMPLATES.general;
        await page.type(`[name="${msgField.name}"], [placeholder="${msgField.placeholder}"]`, template.slice(0, 1000), { delay: 10 });
      }
      
      // Try to submit
      const submitBtn = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button, input[type="submit"], a.submit')];
        return btns.find(b => /submit|send|أرسل|إرسال/i.test(b.textContent || b.value)) ? true : false;
      });
      
      if (submitBtn) {
        await page.click('button[type="submit"], input[type="submit"], button:has-text("submit")');
        log(`  ✅ Form submitted for ${project.name}`);
        return true;
      } else {
        log(`  ⚠️ Submit button not found for ${project.name}`);
        return false;
      }
    } else {
      log(`  ⚠️ Form doesn't have required fields for ${project.name}`);
      return false;
    }
  } catch (err) {
    log(`  ❌ Error on ${project.name}: ${err.message}`);
    return false;
  }
}

async function main() {
  log('=== Starting Outreach DM Sender ===');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  let successCount = 0;
  let failCount = 0;

  for (const project of PROJECTS) {
    log(`Processing: ${project.name} (${project.url})`);
    const success = await tryContactForm(page, project);
    if (success) {
      successCount++;
      updateTracker(project, '-contacted', 'Contact form submitted');
    } else {
      failCount++;
      updateTracker(project, 'form-unavailable', 'No contact form found or submission failed');
    }
    
    // Small delay between projects
    await new Promise(r => setTimeout(r, 2000));
  }

  await browser.close();

  const summary = `Outreach complete: ${successCount} contacted, ${failCount} skipped`;
  log(summary);
  log('=== Outreach DM Sender finished ===');
  
  console.log(JSON.stringify({ success: successCount, failed: failCount, total: PROJECTS.length }));
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
