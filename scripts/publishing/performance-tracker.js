#!/usr/bin/env node
/**
 * performance-tracker.js
 * Track email checks, responses, and publishing metrics
 * Generates daily performance reports
 */

import { config } from '../../src/config.js';
import { sendMessageDetailed } from '../../src/telegram.js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const METRICS_FILE = path.join(ROOT, 'deliverables', 'publishing', 'metrics.json');
const LOG_DIR = path.join(ROOT, 'logs');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
}

function loadMetrics() {
  try {
    return JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
  } catch {
    return {
      emailChecks: 0,
      emailsSent: 30, // from previous session
      responsesReceived: 0,
      postsPublished: 0,
      postsByPlatform: { twitter: 0, linkedin: 0, telegram: 0 },
      postsByLanguage: { ar: 0, en: 0, tr: 0, fa: 0, ur: 0 },
      lastCheck: null,
      lastReport: null,
      history: []
    };
  }
}

function saveMetrics(metrics) {
  fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
}

function generateReport(metrics) {
  const now = new Date().toISOString();
  const report = [
    `📊 تقرير الأداء — ${now.slice(0, 16)}`,
    '',
    `📧 البريد الإلكتروني:`,
    `• فحوصات: ${metrics.emailChecks}`,
    `• رسائل مُرسلة: ${metrics.emailsSent}`,
    `• ردود واردة: ${metrics.responsesReceived}`,
    '',
    `📢 النشر:`,
    `• منشورات مُنشورة: ${metrics.postsPublished}`,
    `• Twitter: ${metrics.postsByPlatform.twitter}`,
    `• LinkedIn: ${metrics.postsByPlatform.linkedin}`,
    `• Telegram: ${metrics.postsByPlatform.telegram}`,
    '',
    `🌐 اللغات:`,
    `• عربي: ${metrics.postsByLanguage.ar}`,
    `• إنجليزي: ${metrics.postsByLanguage.en}`,
    `• تركي: ${metrics.postsByLanguage.tr}`,
    `• فارسي: ${metrics.postsByLanguage.fa}`,
    `• أردوي: ${metrics.postsByLanguage.ur}`,
    '',
    `⏰ آخر فحص: ${metrics.lastCheck || 'لم يُفحص بعد'}`,
    `⏰ آخر تقرير: ${metrics.lastReport || 'لم يُرسل بعد'}`
  ].join('\n');
  
  return report;
}

async function main() {
  const metrics = loadMetrics();
  
  // Count email check logs
  const emailLogPath = path.join(LOG_DIR, 'email-check.log');
  if (fs.existsSync(emailLogPath)) {
    const emailLog = fs.readFileSync(emailLogPath, 'utf8');
    metrics.emailChecks = (emailLog.match(/=== Email Inbox Check ===/g) || []).length;
  }
  
  // Count publish logs
  const publishLogPath = path.join(LOG_DIR, 'publish.log');
  if (fs.existsSync(publishLogPath)) {
    const publishLog = fs.readFileSync(publishLogPath, 'utf8');
    metrics.postsPublished = (publishLog.match(/✅ Published/g) || []).length;
  }
  
  metrics.lastCheck = new Date().toISOString();
  saveMetrics(metrics);
  
  const report = generateReport(metrics);
  log(report);
  
  // Send report to leader
  if (config.telegramChatId) {
    await sendMessageDetailed(report, config.telegramChatId);
  }
  
  console.log(JSON.stringify(metrics));
}

main().catch(err => {
  log(`Error: ${err.message}`);
  process.exit(1);
});
