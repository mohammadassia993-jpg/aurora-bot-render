#!/usr/bin/env node
/**
 * send-opportunity-offers.js
 * Send 10 specialized offers for 3 new opportunities using built-in SMTP
 */

import { config } from '../src/config.js';
import { sendMail } from '../src/mail.js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOG_FILE = path.join(ROOT, 'logs', 'outreach.log');

const OFFERS = [
  {
    project: 'Solana', email: 'partnerships@solana.com',
    subject: 'Smart Contract Content Writing — Arabic Market | Silent Giants',
    body: `مرحباً فريق Solana 👋

فريق عمالقة الصمت يقدم خدمات كتابة محتوى تقني للعقود الذكية على Solana بالعربية:

📝 ما نقدمه:
• مقالات تقنية عن Program Architecture
• أدلة تعليمية للمطورين العرب
• تحليلات أمنية مبسطة
• توثيق أفضل الممارسات

📊 خبرتنا: 92+ مهمة مكتملة | فريق يتحدث العربية | خبرة في Rust

💰 الأسعار: مقال 50-150$ | دليل 100-300$ | تحليل 200-500$

الدفع: USDT | التسليم: 24-72 ساعة

هل تريدون عينة مجانية لمقال تقني عن Solana؟

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'Ethereum Foundation', email: 'partnerships@ethereum.org',
    subject: 'Solidity Content & Documentation — Arabic Web3 Team',
    body: `مرحباً فريق Ethereum 👋

فريق عمالقة الصمت متخصص في كتابة محتوى Solidity بالعربية:
• توثيق العقود الذكية | أدلة مبتدئين ومتقدمين | تحليل Design Patterns
92+ مهمة | خبرة في Solidity, Vyper
💰 أسعار تنافسية | USDT | تسليم سريع

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'Aptos', email: 'partnerships@aptoslabs.com',
    subject: 'Move Smart Contract Content — Arabic Technical Writing',
    body: `مرحباً فريق Aptos 👋

فريق عمالقة الصمت يقدم محتوى تقني عن Move بالعربية:
• أدلة تعليمية | توثيق عقود | تحليل ميزات | مقارنات مع Solidity
92+ مهمة | فريق تقني عربي | USDT | تسليم سريع

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'Compound', email: 'governance@compound.finance',
    subject: 'DAO Governance Support — Arabic Community Engagement',
    body: `مرحباً فريق Compound 👋

فريق عمالقة الصمت يقدم خدمات حوكمة DAO:
• كتابة مقترحات | تحليل التصويت | ترجمة للعربية | تقارير شهرية
💰 200-500$ لكل مقترح | USDT

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'Curve Finance', email: 'team@curve.fi',
    subject: 'DAO Governance Content & Arabic Community Support',
    body: `مرحباً فريق Curve 👋

فريق عمالقة الصمت متخصص في محتوى الحوكمة:
• ترجمة مقترحات | محتوى تعليمي | تحليل التأثير | تقارير شهرية
💰 أسعار تنافسية | USDT

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'Yearn Finance', email: 'team@yearn.finance',
    subject: 'DAO Governance & Arabic Content — Silent Giants Team',
    body: `مرحباً فريق Yearn 👋

فريق عمالقة الصمت يقدم خدمات حوكمة:
• مقترحات حوكمة | تحليل Vault Strategies | محتوى تعليمي | تقارير
💰 أسعار تنافسية | USDT

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'Messari', email: 'research@messari.io',
    subject: 'Web3 Research Reports — Arabic Market Expansion',
    body: `مرحباً فريق Messari 👋

فريق عمالقة الصمت يقدم خدمات بحثية:
• تقارير بحثية | تحليل on-chain | مقارنات | تقييم مخاطر
💰 تقارير 200-1000$ | USDT

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'Delphi Digital', email: 'research@delphidigital.io',
    subject: 'Arabic Web3 Research & Analysis Services',
    body: `مرحباً فريق Delphi 👋

فريق عمالقة الصمت يقدم تقارير بحثية:
• تحليل مشاريع | sector analysis | تحليلات اقتصادية | تقارير DePIN
💰 USDT | أسعار تنافسية

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'The Block', email: 'research@theblock.co',
    subject: 'Arabic Crypto Research — Content Partnership',
    body: `مرحباً فريق The Block 👋

فريق عمالقة الصمت متخصص في البحث والتحليل:
• تقارير سوق | تحليل اتجاهات | مقارنات منصات | تقارير DePIN
💰 شراكة محتوى | USDT

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'Dune Analytics', email: 'hello@dune.com',
    subject: 'On-chain Data Analysis — Arabic Web3 Research',
    body: `مرحباً فريق Dune 👋

فريق عمالقة الصمت يقدم تحليل بيانات on-chain:
• تحليل blockchain | dashboards | تقارير نمو | مقارنات أداء
💰 USDT | أسعار تنافسية

📧 auroraalmada4@gmail.com`
  }
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function main() {
  log('=== Starting Opportunity Offers (10 emails) ===');
  log(`Mail mode: ${config.mailDeliveryMode}`);
  
  let successCount = 0;
  let failCount = 0;

  for (const offer of OFFERS) {
    try {
      const result = await sendMail({
        to: offer.email,
        subject: offer.subject,
        text: offer.body
      });
      successCount++;
      log(`✅ Offer sent to ${offer.project} (${offer.email}) [${result.disabled ? 'queued' : 'sent'}]`);
    } catch (err) {
      failCount++;
      log(`❌ Failed ${offer.project}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  log(`Opportunity offers: ${successCount} sent, ${failCount} failed`);
  log('=== Opportunity Offers finished ===');
  console.log(JSON.stringify({ success: successCount, failed: failCount, total: OFFERS.length }));
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
