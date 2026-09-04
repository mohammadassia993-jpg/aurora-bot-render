#!/usr/bin/env node
/**
 * smart-email-reply.js
 * Check inbox, detect new emails, generate smart replies via Agnes AI
 * Replies in natural conversational Arabic (not template-based)
 */

import { config } from '../src/config.js';
import { sendMail } from '../src/mail.js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOG_FILE = path.join(ROOT, 'logs', 'smart-reply.log');
const REPLIED_FILE = path.join(ROOT, 'data', 'replied-emails.json');
const STORE_URL = 'https://mohammadassia993-jpg.github.io/aurora-bot-render/';
const BOT_URL = 'https://t.me/Aurora_Almada_88_Bot';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function loadReplied() {
  try { return JSON.parse(fs.readFileSync(REPLIED_FILE, 'utf8')); }
  catch { return { replied: [] }; }
}

function saveReplied(data) {
  fs.writeFileSync(REPLIED_FILE, JSON.stringify(data, null, 2));
}

async function callAgnesAI(prompt) {
  try {
    const response = await fetch(`${config.agnesUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.agnesKey}`
      },
      body: JSON.stringify({
        model: config.agnesModel,
        messages: [
          {
            role: 'system',
            content: `أنت أورورا، مساعدة افتراضية محترفة وودودة من فريق "عمالقة الصمت" (Silent Giants).
personality:
- ودودة وطبيعية (مثل مساعد بشري حقيقي)
- تتحدث بالعربية الفصحى الواضحة مع لمسة عفوية
- لا تستخدم قوالب جافة أو ردود مكررة
- تذكر اسم العميل إن وُجد
- تقدم مساعدة حقيقية وليست مجرد مجاملات
- ذكية وم.Directe في الرد
- تذكر المنتجات والخدمات عند المناسبة

خدماتنا:
- محتوى Web3 بالعربية (مقالات، ترجمة، تقارير)
- 6 منتجات رقمية جاهزة (15-40$)
- إدارة مجتمعات Web3
- تحليل أمن واقتصاد رمزي

الدفع: USDT/USDC فقط
المتجر: ${STORE_URL}
البوت: ${BOT_URL}`
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.8
      })
    });
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    log(`Agnes AI error: ${err.message}`);
    return '';
  }
}

async function processEmail(emailFrom, emailSubject, emailBody) {
  log(`Processing email from: ${emailFrom} | Subject: ${emailSubject}`);
  
  // Generate smart reply via Agnes AI
  const prompt = `رسالة بريد إلكتروني واردة:
من: ${emailFrom}
الموضوع: ${emailSubject}
النص: ${emailBody}

قم بكتابة رد محادثة طبيعي بالعربية على هذه الرسالة. كأنك مساعد بشري محترف وودود من فريق "عمالقة الصمت". 
- لا تستخدم قوالب جافة
- اجعل الرد مخصصاً لمحتوى الرسالة
- ذكر المنتجات والخدمات إن كان مناسباً
- كن ودوداً ومDirectaً
- لا تزد عن 200 كلمة`;

  const aiReply = await callAgnesAI(prompt);
  
  if (aiReply) {
    log(`AI reply generated (${aiReply.length} chars)`);
    
    // Send the reply
    const result = await sendMail({
      to: emailFrom,
      subject: `Re: ${emailSubject}`,
      text: aiReply
    });
    
    log(`Reply sent to ${emailFrom}: ${result.disabled ? 'queued' : 'sent'}`);
    return { sent: true, to: emailFrom, subject: emailSubject };
  } else {
    log(`Failed to generate AI reply for ${emailFrom}`);
    return { sent: false, to: emailFrom, error: 'AI generation failed' };
  }
}

async function main() {
  log('=== Smart Email Reply System Started ===');
  log(`Mail mode: ${config.mailDeliveryMode}`);
  log(`Agnes URL: ${config.agnesUrl}`);
  
  // For now, log that the system is ready
  // In production, this would be triggered by the cron job
  // and would check the inbox via IMAP
  
  log('Smart reply system ready. Waiting for email check trigger...');
  log('=== Smart Email Reply System finished ===');
  
  console.log(JSON.stringify({ 
    status: 'ready', 
    mailMode: config.mailDeliveryMode,
    agnesConfigured: Boolean(config.agnesKey),
    storeUrl: STORE_URL
  }));
}

// Run if called directly
main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});

export { processEmail, callAgnesAI };
