/**
 * followup-scheduler.js — Automatic followup system for job applications
 * 
 * Cycle: 48h → 7 days → 14 days (close)
 * 
 * Integration: called by scheduler.js every 6 hours
 */
import { db } from '../db.js';
import { sendMail } from '../mail.js';
import { sendMessageDetailed } from '../telegram.js';
import { config } from '../config.js';
import { info, warn } from '../logger.js';

const FOLLOWUP_48H_MS = 48 * 60 * 60 * 1000;
const FOLLOWUP_7D_MS = 7 * 24 * 60 * 60 * 1000;
const FOLLOWUP_14D_MS = 14 * 24 * 60 * 60 * 1000;

const FOLLOWUP_48H_SUBJECT = 'Follow-up: Content Services Partnership';
const FOLLOWUP_48H_BODY = `Hello,

I'm following up on my previous email regarding content services partnership.

We specialize in Arabic Web3 content:
• Technical articles and translations (EN↔AR)
• Community management
• Educational content for DeFi, DePIN, and smart contracts

Portfolio: 92+ ready tasks
Payment: USDT/USDC preferred

Would love to discuss potential collaboration.

Best regards,
Silent Giants Team
auroraalmada4@gmail.com`;

const FOLLOWUP_7D_SUBJECT = 'Reminder: Content Services — Silent Giants';
const FOLLOWUP_7D_BODY = `Hello,

Just a friendly reminder about our content services partnership offer.

We're available for:
• Arabic/English technical content
• Web3 community management
• Smart contract documentation
• DeFi educational content

If you're interested, we'd be happy to share samples or discuss terms.

Best regards,
Silent Giants Team
auroraalmada4@gmail.com`;

/**
 * Get applications that need followup
 */
function getPendingFollowups() {
  const now = Date.now();
  
  // 48h followups (sent 48h ago, no response yet)
  const followups48h = db.prepare(`
    SELECT * FROM mail_queue 
    WHERE status = 'sent' 
    AND subject LIKE '%Partnership%'
    AND updated_at < datetime('now', '-48 hours')
    AND id NOT IN (SELECT id FROM mail_queue WHERE subject LIKE '%Follow-up%' AND status = 'sent')
  `).all();
  
  // 7-day followups (sent 7 days ago, no response)
  const followups7d = db.prepare(`
    SELECT * FROM mail_queue 
    WHERE status = 'sent'
    AND subject LIKE '%Partnership%'
    AND updated_at < datetime('now', '-7 days')
    AND id NOT IN (SELECT id FROM mail_queue WHERE subject LIKE '%Reminder%' AND status = 'sent')
  `).all();
  
  // 14-day closures (sent 14 days ago, mark as closed)
  const closures14d = db.prepare(`
    SELECT to_address, COUNT(*) as count FROM mail_queue 
    WHERE status = 'sent'
    AND subject LIKE '%Partnership%'
    AND updated_at < datetime('now', '-14 days')
    GROUP BY to_address
  `).all();
  
  return { followups48h, followups7d, closures14d };
}

/**
 * Run followup cycle
 */
export async function runFollowupCycle() {
  info('followup', '🔄 Running followup cycle...');
  
  const { followups48h, followups7d, closures14d } = getPendingFollowups();
  
  let sent = 0;
  
  // Send 48h followups
  for (const app of followups48h) {
    try {
      await sendMail({
        to: app.to_address,
        subject: FOLLOWUP_48H_SUBJECT,
        text: FOLLOWUP_48H_BODY
      });
      sent++;
      info('followup', `48h followup sent to ${app.to_address}`);
      await new Promise(r => setTimeout(r, 60000)); // Rate limit
    } catch (e) {
      warn('followup', `Failed to send 48h followup to ${app.to_address}: ${e.message}`);
    }
  }
  
  // Send 7-day reminders
  for (const app of followups7d) {
    try {
      await sendMail({
        to: app.to_address,
        subject: FOLLOWUP_7D_SUBJECT,
        text: FOLLOWUP_7D_BODY
      });
      sent++;
      info('followup', `7d reminder sent to ${app.to_address}`);
      await new Promise(r => setTimeout(r, 60000)); // Rate limit
    } catch (e) {
      warn('followup', `Failed to send 7d reminder to ${app.to_address}: ${e.message}`);
    }
  }
  
  // Log 14-day closures
  if (closures14d.length > 0) {
    const summary = closures14d.map(c => `${c.to_address} (${c.count} emails)`).join(', ');
    info('followup', `14d closures: ${summary}`);
    await sendMessageDetailed(
      `📋 طلبات مغلقة (14 يوم بدون رد): ${summary}`,
      config.telegramChatId
    );
  }
  
  info('followup', `✅ Followup cycle complete: ${sent} emails sent`);
  return { sent, followups48h: followups48h.length, followups7d: followups7d.length, closures14d: closures14d.length };
}

export default { runFollowupCycle };
