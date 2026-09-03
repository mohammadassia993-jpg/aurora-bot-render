#!/usr/bin/env node
/**
 * send-outreach-dms.js
 * Send outreach messages to 20 Arabic Web3 projects via email
 * Works on any platform (no Puppeteer required)
 */

import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOG_FILE = path.join(ROOT, 'logs', 'outreach.log');
const TRACKER = path.join(ROOT, 'deliverables', 'outreach-2026-09-03', 'tracker.md');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || 'Mohammadassia993@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || 'smsusatmgawyndfp';

const DM_TEMPLATES = {
  trading: `مرحباً 👋

فريق عمالقة الصمت يقدم خدمات محتوى Web3 احترافية بالعربية:

• مقالات تعليمية جاهزة للنشر عن التداول وال DeFi
• ترجمة وثائق تقنية (EN→AR) باحترافية
• إدارة محتوى شهرية للمجتمع العربي
• تقارير تحليلية عن السوق

لدينا 92+ مهمة مكتملة وعينات عمل جاهزة للمراجعة.
الدفع: USDT | التسليم: 24-72 ساعة

هل يمكننا التواصل لمناقشة تعاون محتمل؟

مع أطيب التحيات،
فريق عمالقة الصمت
📧 auroraalmada4@gmail.com
🌐 https://mohammadassia993-jpg.github.io/aurora-bot-render/`,

  depin: `مرحباً 👋

فريق عمالقة الصمت متخصص في محتوى DePIN بالعربية:

• مقالات تقنية عن شبكة المشروع بالعربية
• أدلة تعليمية للمستخدمين العرب
• تحليلات تقنية مبسطة للمجتمع
• ترجمة وثائق تقنية احترافية

نقدم تحليل مجاني لمشروعكم كخطوة أولى.
الدفع: USDT | التسليم: 24-72 ساعة

هل يمكننا التواصل؟

مع أطيب التحيات،
فريق عمالقة الصمت
📧 auroraalmada4@gmail.com`,

  dao: `مرحباً 👋

فريق عمالقة الصمت يقدم خدمات حوكمة DAO:

• كتابة مقترحات حوكمة بالعربية
• تحليل اتجاهات التصويت والتقارير الشهرية
• ترجمة مقترحات الحوكمة للعربية
• دعم المجتمع العربي في القرارات الجماعية

نقدم تحليل مجاني لأول مقترح حوكمة.
الدفع: USDT | التسليم: 48 ساعة

هل تحتاجون مساعدة في توسيع المجتمع العربي؟

مع أطيب التحيات،
فريق عمالقة الصمت
📧 auroraalmada4@gmail.com`,

  general: `مرحباً 👋

فريق عمالقة الصمت يقدم خدمات محتوى Web3:

• كتابة محتوى احترافي (مقالات، تقارير، أدلة)
• ترجمة EN→AR باحترافية (250+ مصطلح)
• تقارير بحثية عن مشاريع Web3
• محتوى تعليمي للمبتدئين والمتقدمين

92+ مهمة مكتملة | دفع USDT | تسليم 24-72 ساعة

هل تريدون عرضاً مخصصاً لمشروعكم؟

مع أطيب التحيات،
فريق عمالقة الصمت
📧 auroraalmada4@gmail.com
🌐 https://mohammadassia993-jpg.github.io/aurora-bot-render/`
};

const PROJECTS = [
  { name: 'BitOasis', email: 'support@bitoasis.net', type: 'trading', twitter: '@BitOasis' },
  { name: 'CoinMENA', email: 'info@coinmena.com', type: 'trading', twitter: '@CoinMENA' },
  { name: 'Rain', email: 'support@rain.co', type: 'trading', twitter: '@rainaborse' },
  { name: 'Fasset', email: 'info@fasset.com', type: 'trading', twitter: '@FassetT' },
  { name: 'Render Network', email: 'hello@rendernetwork.org', type: 'depin', twitter: '@rendernetwork' },
  { name: 'Filecoin', email: 'info@filecoin.io', type: 'depin', twitter: '@Filecoin' },
  { name: 'Helium', email: 'hello@helium.com', type: 'depin', twitter: '@helium' },
  { name: 'Arweave', email: 'info@arweave.org', type: 'depin', twitter: '@Arab_orders' },
  { name: 'MakerDAO', email: 'governance@makerdao.com', type: 'dao', twitter: '@MakerDAO' },
  { name: 'Aave', email: 'governance@aave.com', type: 'dao', twitter: '@AaveAave' },
  { name: 'Uniswap', email: 'governance@uniswap.org', type: 'dao', twitter: '@Uniswap' },
  { name: 'Arbitrum', email: 'info@arbitrum.io', type: 'general', twitter: '@Arbitrum' },
  { name: 'Polygon', email: 'info@polygon.technology', type: 'general', twitter: '@0xPolygon' },
  { name: 'Optimism', email: 'info@optimism.io', type: 'general', twitter: '@optimismFND' },
  { name: 'NEAR Protocol', email: 'info@near.org', type: 'general', twitter: '@NEARProtocol' },
  { name: 'zkSync', email: 'info@zksync.io', type: 'general', twitter: '@zksync' },
  { name: 'StarkNet', email: 'info@starknet.io', type: 'general', twitter: '@StarkNet' },
  { name: 'Cosmos', email: 'info@cosmos.network', type: 'general', twitter: '@cosmos' },
  { name: 'Polkadot', email: 'info@polkadot.network', type: 'general', twitter: '@Polkadot' },
  { name: 'Avalanche', email: 'info@avax.network', type: 'general', twitter: '@avaborse' }
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

async function main() {
  log('=== Starting Email Outreach to 20 Projects ===');
  
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  let successCount = 0;
  let failCount = 0;

  for (const project of PROJECTS) {
    try {
      const template = DM_TEMPLATES[project.type] || DM_TEMPLATES.general;
      const subject = `عرض تعاون — محتوى Web3 بالعربية | فريق عمالقة الصمت`;
      
      await transporter.sendMail({
        from: `"عمالقة الصمت" <${SMTP_USER}>`,
        to: project.email,
        subject,
        text: template,
        replyTo: 'auroraalmada4@gmail.com'
      });

      successCount++;
      log(`✅ Sent to ${project.name} (${project.email})`);
      updateTracker(project, 'email-sent', `Email sent to ${project.email}`);
    } catch (err) {
      failCount++;
      log(`❌ Failed ${project.name}: ${err.message}`);
      updateTracker(project, 'email-failed', err.message.slice(0, 100));
    }
    
    // Delay between emails to avoid rate limiting
    await new Promise(r => setTimeout(r, 3000));
  }

  const summary = `Email outreach complete: ${successCount} sent, ${failCount} failed out of ${PROJECTS.length}`;
  log(summary);
  log('=== Email Outreach finished ===');
  
  console.log(JSON.stringify({ success: successCount, failed: failCount, total: PROJECTS.length }));
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
