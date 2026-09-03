#!/usr/bin/env node
/**
 * send-opportunity-offers.js
 * Send 10 specialized offers to 10 additional projects for 3 new opportunities
 */

import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOG_FILE = path.join(ROOT, 'logs', 'outreach.log');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || 'Mohammadassia993@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || 'smsusatmgawyndfp';

const OFFERS = [
  // Smart Contract Content (3)
  {
    project: 'Solana',
    email: 'partnerships@solana.com',
    subject: 'Smart Contract Content Writing — Arabic Market | Silent Giants',
    body: `مرحباً فريق Solana 👋

فريق عمالقة الصمت يقدم خدمات كتابة محتوى تقني للعقود الذكية على Solana بالعربية:

📝 ما نقدمه:
• مقالات تقنية عن Program Architecture
• أدلة تعليمية للمطورين العرب
• تحليلات أمنية مبسطة
• توثيق أفضل الممارسات

📊 خبرتنا:
• 92+ مهمة مكتملة في مجال Web3
• فريق يتحدث العربية بطلاقة
• خبرة في Solidity, Rust, Move

💰 الأسعار:
• مقال تقني: 50-150$
• دليل تعليمي: 100-300$
• تحليل أمني: 200-500$

الدفع: USDT | التسليم: 24-72 ساعة

هل تريدون عينة مجانية لمقال تقني عن Solana؟

مع أطيب التحيات،
فريق عمالقة الصمت
📧 auroraalmada4@gmail.com`
  },
  {
    project: 'Ethereum Foundation',
    email: 'partnerships@ethereum.org',
    subject: 'Solidity Content & Documentation — Arabic Web3 Team',
    body: `مرحباً فريق Ethereum 👋

فريق عمالقة الصمت متخصص في كتابة محتوى Solidity بالعربية:

📝 الخدمات:
• توثيق العقود الذكية
• أدلة مبتدئين ومتقدمين
• تحليل أنماط التصميم (Design Patterns)
• مقالات عن أمن العقود

📊 خبرتنا في Web3:
• فريق تقني يتحدث العربية
• خبرة في Solidity, Vyper
• 92+ مهمة مكتملة

💰 أسعار تنافسية | الدفع USDT | التسليم سريع

هل تريدون عرض أسعار مخصص؟

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'Aptos',
    email: 'partnerships@aptoslabs.com',
    subject: 'Move Smart Contract Content — Arabic Technical Writing',
    body: `مرحباً فريق Aptos 👋

فريق عمالقة الصمت يقدم محتوى تقني عن Move بالعربية:

📝 الخدمات:
• أدلة تعليمية عن Move Language
• توثيق العقود الذكية
• تحليل الميزات التقنية
• مقارنات مع Solidity

📊 خبرتنا: 92+ مهمة مكتملة | فريق تقني عربي

💰 أسعار تنافسية | USDT | تسليم سريع

📧 auroraalmada4@gmail.com`
  },
  // DAO Governance (3)
  {
    project: 'Compound',
    email: 'governance@compound.finance',
    subject: 'DAO Governance Support — Arabic Community Engagement',
    body: `مرحباً فريق Compound 👋

فريق عمالقة الصمت يقدم خدمات حوكمة DAO:

📝 الخدمات:
• كتابة مقترحات حوكمة بالعربية
• تحليل اتجاهات التصويت
• ترجمة مقترحات للمجتمع العربي
• تقارير شهرية عن الحوكمة

📊 خبرتنا: 92+ مهمة | خبرة في Governance

💰 الأسعار: 200-500$ لكل مقترح

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'Curve Finance',
    email: 'team@curve.fi',
    subject: 'DAO Governance Content & Arabic Community Support',
    body: `مرحباً فريق Curve 👋

فريق عمالقة الصمت متخصص في محتوى الحوكمة:

📝 الخدمات:
• ترجمة مقترحات Curve Governance
• كتابة محتوى تعليمي عن Voting
• تحليل تأثير المقترحات على المجتمع
• تقارير شهرية

💰 أسعار تنافسية | USDT | تسليم سريع

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'Yearn Finance',
    email: 'team@yearn.finance',
    subject: 'DAO Governance & Arabic Content — Silent Giants Team',
    body: `مرحباً فريق Yearn 👋

فريق عمالقة الصمت يقدم خدمات حوكمة:

📝 الخدمات:
• كتابة مقترحات حوكمة
• تحليل Vault Strategies بالعربية
• محتوى تعليمي للمجتمع
• تقارير أداء شهرية

💰 أسعار تنافسية | USDT

📧 auroraalmada4@gmail.com`
  },
  // Research & Analysis (4)
  {
    project: 'Messari',
    email: 'research@messari.io',
    subject: 'Web3 Research Reports — Arabic Market Expansion',
    body: `مرحباً فريق Messari 👋

فريق عمالقة الصمت يقدم خدمات بحثية:

📝 الخدمات:
• تقارير بحثية عن مشاريع Web3 بالعربية
• تحليل بيانات on-chain
• مقارنات مشاريع
• تقييم مخاطر

📊 خبرتنا: 92+ مهمة | فريق بحثي عربي

💰 تقارير: 200-1000$ حسب العمق

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'Delphi Digital',
    email: 'research@delphidigital.io',
    subject: 'Arabic Web3 Research & Analysis Services',
    body: `مرحباً فريق Delphi 👋

فريق عمالقة الصمت يقدم تقارير بحثية:

📝 الخدمات:
• تحليل مشاريع Web3 بالعربية
• تقارير sector analysis
• تحليلات اقتصادية للرموز
• تقارير DePIN

💰 أسعار تنافسية | USDT

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'The Block',
    email: 'research@theblock.co',
    subject: 'Arabic Crypto Research — Content Partnership',
    body: `مرحباً فريق The Block 👋

فريق عمالقة الصمت متخصص في البحث والتحليل:

📝 الخدمات:
• تقارير سوق كريبتو بالعربية
• تحليل اتجاهات السوق
• مقارنات منصات التداول
• تقارير DePIN/DeFi

💰 شراكة محتوى | USDT | أسعار تنافسية

📧 auroraalmada4@gmail.com`
  },
  {
    project: 'Dune Analytics',
    email: 'hello@dune.com',
    subject: 'On-chain Data Analysis — Arabic Web3 Research',
    body: `مرحباً فريق Dune 👋

فريق عمالقة الصمت يقدم تحليل بيانات on-chain:

📝 الخدمات:
• تحليل بيانات blockchain بالعربية
• إنشاء dashboards للمجتمع
• تقارير نمو مشاريع
• مقارنات أداء الشبكات

💰 أسعار تنافسية | USDT

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
  
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  let successCount = 0;
  let failCount = 0;

  for (const offer of OFFERS) {
    try {
      await transporter.sendMail({
        from: `"عمالقة الصمت" <${SMTP_USER}>`,
        to: offer.email,
        subject: offer.subject,
        text: offer.body,
        replyTo: 'auroraalmada4@gmail.com'
      });
      successCount++;
      log(`✅ Offer sent to ${offer.project} (${offer.email})`);
    } catch (err) {
      failCount++;
      log(`❌ Failed ${offer.project}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  const summary = `Opportunity offers: ${successCount} sent, ${failCount} failed`;
  log(summary);
  log('=== Opportunity Offers finished ===');
  
  console.log(JSON.stringify({ success: successCount, failed: failCount, total: OFFERS.length }));
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
