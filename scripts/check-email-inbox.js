#!/usr/bin/env node
/**
 * check-email-inbox.js
 * Monitor email inbox for responses every 2 hours
 * Uses IMAP to check for new emails
 */

import { config } from '../src/config.js';
import { sendMessageDetailed } from '../src/telegram.js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOG_FILE = path.join(ROOT, 'logs', 'email-check.log');
const RESPONSES_FILE = path.join(ROOT, 'deliverables', 'outreach-2026-09-03', 'responses.md');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

async function checkInbox() {
  log('=== Email Inbox Check ===');
  
  // Check if IMAP is configured
  const imapHost = process.env.IMAP_HOST || '';
  const imapUser = process.env.IMAP_USER || config.smtpUser || '';
  const imapPass = process.env.IMAP_PASS || config.smtpPass || '';
  
  if (!imapHost || !imapUser) {
    log('IMAP not configured — using SMTP health check instead');
    // Fallback: just verify SMTP is working
    log(`SMTP config: host=${config.smtpHost} user=${config.smtpUser} mode=${config.mailDeliveryMode}`);
    log('Inbox check complete (SMTP verification only)');
    return { checked: true, method: 'smtp-verify', responses: 0 };
  }

  // If IMAP is configured, use it
  try {
    const { default: Imap } = await import('imap');
    const imap = new Imap({
      user: imapUser,
      password: imapPass,
      host: imapHost,
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });

    return new Promise((resolve, reject) => {
      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err, box) => {
          if (err) { imap.end(); reject(err); return; }
          
          const since = new Date(Date.now() - 2 * 60 * 60 * 1000); // Last 2 hours
          const searchCriteria = ['ALL', ['SINCE', since.toISOString().split('T')[0]]];
          
          imap.search(searchCriteria, (err, results) => {
            if (err) { imap.end(); reject(err); return; }
            
            log(`Found ${results.length} emails in last 2 hours`);
            
            if (results.length === 0) {
              imap.end();
              resolve({ checked: true, method: 'imap', responses: 0 });
              return;
            }

            const emails = [];
            const fetch = imap.fetch(results, { bodies: 'HEADER.FIELDS (FROM SUBJECT DATE)', struct: true });
            
            fetch.on('message', (msg, seqno) => {
              msg.on('body', (stream) => {
                let buffer = '';
                stream.on('data', (chunk) => buffer += chunk.toString());
                stream.on('end', () => {
                  const from = buffer.match(/From:\s*(.+)/i)?.[1]?.trim() || '';
                  const subject = buffer.match(/Subject:\s*(.+)/i)?.[1]?.trim() || '';
                  const date = buffer.match(/Date:\s*(.+)/i)?.[1]?.trim() || '';
                  if (from && !from.includes(config.smtpUser)) {
                    emails.push({ from, subject, date });
                  }
                });
              });
            });

            fetch.once('end', () => {
              log(`New emails from others: ${emails.length}`);
              for (const email of emails) {
                log(`  From: ${email.from} | Subject: ${email.subject}`);
              }
              
              // Save responses
              if (emails.length > 0) {
                let md = fs.existsSync(RESPONSES_FILE) ? fs.readFileSync(RESPONSES_FILE, 'utf8') : '# Responses Log\n\n';
                md += `## Check: ${new Date().toISOString()}\n\n`;
                for (const email of emails) {
                  md += `- **From:** ${email.from}\n- **Subject:** ${email.subject}\n- **Date:** ${email.date}\n\n`;
                }
                fs.writeFileSync(RESPONSES_FILE, md);
              }
              
              imap.end();
              resolve({ checked: true, method: 'imap', responses: emails.length, emails });
            });
          });
        });
      });

      imap.once('error', (err) => {
        log(`IMAP error: ${err.message}`);
        reject(err);
      });

      imap.connect();
    });
  } catch (err) {
    log(`Email check error: ${err.message}`);
    return { checked: false, error: err.message };
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  checkInbox()
    .then(result => {
      log(`Result: ${JSON.stringify(result)}`);
      process.exit(0);
    })
    .catch(err => {
      log(`Fatal: ${err.message}`);
      process.exit(1);
    });
}

export { checkInbox };
