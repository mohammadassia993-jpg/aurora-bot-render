/**
 * outreach.js — Real email outreach to Web3 projects & clients
 * Uses SMTP (Gmail app password) with nodemailer-style API via raw fetch
 */
import nodemailer from 'nodemailer';
import { db } from './db.js';
import { info, warn } from './logger.js';

const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const EMAIL_FROM = process.env.OFFICIAL_EMAIL || 'auroraalmada4@gmail.com';

const MAJOR_PROJECTS = [
  { name: 'Solana Foundation', email: 'grants@solana.org', focus: 'Solana ecosystem grants' },
  { name: 'Render Network', email: 'partnerships@render.com', focus: 'Render decentralized GPU rendering' },
  { name: 'Filecoin Foundation', email: 'grants@fil.org', focus: 'Filecoin storage network grants' },
  { name: 'Chainlink', email: 'partnerships@chain.link', focus: 'Chainlink oracle network' },
  { name: 'Polygon Labs', email: 'partnerships@polygon.technology', focus: 'Polygon scaling solutions' },
  { name: 'Arweave', email: 'partnerships@arweave.org', focus: 'Arweave permanent storage' },
  { name: 'Algorand Foundation', email: 'grants@algorand.foundation', focus: 'Algorand blockchain ecosystem' },
  { name: 'Celestia', email: 'partnerships@celestia.org', focus: 'Celestia modular blockchain' },
  { name: 'Movement Labs', email: 'partnerships@movementlabs.xyz', focus: 'Movement Labs Move VM' },
  { name: 'Berachain', email: 'partnerships@berachain.com', focus: 'Berachain PoL consensus' },
  { name: 'Aptos Foundation', email: 'grants@aptos.foundation', focus: 'Aptos Move ecosystem' },
  { name: 'Sui Foundation', email: 'grants@sui.io', focus: 'Sui Move ecosystem' },
];

function buildBody(project) {
  return `Hi ${project.name} Team,

I'm reaching out from Silent Giants, a Web3 content and marketing agency.

We specialize in:
- Technical writing and documentation for blockchain projects
- Arabic and English content creation for Web3 ecosystems
- Marketing campaigns and community engagement
- Bounty and task completion for DeFi and NFT platforms

We have delivered 92+ content tasks across multiple Web3 platforms and are looking for ongoing partnerships with ${project.name} for:
* Monthly content packages (5 articles + 3 translations + weekly reports)
* Marketing campaigns for ecosystem growth
* Technical documentation and guides

We can start with a free sample piece tailored to ${project.focus}.

Would you be open to discussing how we can support your ecosystem?

Best regards,
Silent Giants Team
https://t.me/SilentGiants_Store
${EMAIL_FROM}`;
}

export async function sendOutreachEmails(limit = 12) {
  if (!SMTP_USER || !SMTP_PASS) {
    warn('outreach', 'No SMTP credentials configured');
    return { ok: false, error: 'no_smtp_credentials' };
  }
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: false }
  });

  const results = [];
  // Check which emails already sent
  const sentSet = new Set();
  try {
    const rows = db.prepare("SELECT to_address FROM mail_queue WHERE status='sent'").all();
    for (const r of rows) sentSet.add(String(r.to_address).toLowerCase());
  } catch {}

  for (const project of MAJOR_PROJECTS.slice(0, limit)) {
    if (sentSet.has(project.email.toLowerCase())) {
      info('outreach', 'Already emailed ' + project.email);
      results.push({ name: project.name, email: project.email, ok: false, error: 'already_sent' });
      continue;
    }
    try {
      const info = await transporter.sendMail({
        from: `"Silent Giants" <${EMAIL_FROM}>`,
        to: project.email,
        subject: 'Silent Giants — Web3 Content & Marketing Partnership',
        text: buildBody(project)
      });
      db.prepare(`
        INSERT INTO mail_queue(to_address, subject, body, status, attempts, last_error, created_at, updated_at)
        VALUES (?, ?, ?, 'sent', 1, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(project.email, 'Silent Giants — Web3 Content & Marketing Partnership', buildBody(project));
      results.push({ name: project.name, email: project.email, ok: true, messageId: info.messageId });
      info('outreach', 'Email sent to ' + project.email + ' (' + info.messageId + ')');
    } catch (e) {
      warn('outreach', 'Failed to send to ' + project.email + ': ' + e.message);
      results.push({ name: project.name, email: project.email, ok: false, error: e.message });
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  return { ok: true, sent: results.filter(r => r.ok).length, total: results.length, results };
}

export default { sendOutreachEmails, MAJOR_PROJECTS };
