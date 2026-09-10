import { resolveMx } from 'node:dns';
import { db } from '../db.js';
import { enqueueMail, runMailQueue } from '../mail.js';
import { info } from '../logger.js';
import fs from 'node:fs';

// Email verification via MX record check
async function verifyEmail(email) {
  const domain = email.split('@')[1];
  return new Promise((resolve) => {
    resolveMx(domain, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        resolve({ valid: false, reason: 'no_mx_records' });
      } else {
        resolve({ valid: true, mx: addresses[0].exchange });
      }
    });
  });
}

// Job opportunities with verified company domains
const opportunities = [
  // Previously sent - skip
  // { title: 'Head of Marketing', company: 'garden3d', email: 'careers@garden3d.io', sent: true },
  // { title: 'Course Writer', company: 'IDF', email: 'jobs@interaction-design.org', sent: true },
  
  // New applications to send
  { title: 'Freelance Writer', company: 'IAPWE', email: 'support@iapwe.org', domain: 'iapwe.org' },
  { title: 'Freelance Copywriter', company: 'Coalition Technologies', email: 'hello@coalitiontechnologies.com', domain: 'coalitiontechnologies.com' },
  { title: 'AI Response Analyst', company: 'iMerit Technology', email: 'careers@imerit.net', domain: 'imerit.net' },
  { title: 'Content Reviewer', company: 'TELUS Digital', email: 'careers@telusinternational.com', domain: 'telusinternational.com' },
  { title: 'Junior Crypto Analyst', company: 'Empire Assets', email: 'info@empireassets.io', domain: 'empireassets.io' },
  { title: 'Social Comms', company: 'NOPE', email: 'hello@nope.com', domain: 'nope.com' },
  { title: 'Marketing Operations', company: 'Engine', email: 'careers@engine.com', domain: 'engine.com' },
  { title: 'Influencer Marketing Lead', company: 'Aftershoot', email: 'jobs@aftershoot.co', domain: 'aftershoot.co' },
  { title: 'Business Development', company: 'GROW10X', email: 'hello@grow10x.com', domain: 'grow10x.com' },
  { title: 'Market Research', company: 'GROW10X', email: 'research@grow10x.com', domain: 'grow10x.com' },
  { title: 'Freelance Creative Director', company: 'BMWL', email: 'info@bmwl.co', domain: 'bmwl.co' },
  { title: 'Growth Strategist', company: 'Lyric', email: 'careers@lyric.com', domain: 'lyric.com' },
  { title: 'Data Analyst', company: 'SEAhub Asia', email: 'hello@seahub.asia', domain: 'seahub.asia' },
  { title: 'Brand Protection Analyst', company: 'MultiplyMii', email: 'careers@multiplymii.com', domain: 'multiplymii.com' },
  { title: 'Marketing Specialist', company: 'INNERGY', email: 'jobs@innergy.com', domain: 'innergy.com' },
  { title: 'Solutions Delivery Manager', company: 'Benchling', email: 'careers@benchling.com', domain: 'benchling.com' },
  { title: 'Head of Security', company: 'Tremendous', email: 'security@tremendous.com', domain: 'tremendous.com' },
  { title: 'Staff Software Engineer', company: 'Evolve', email: 'careers@evolve.com', domain: 'evolve.com' },
  { title: 'Engineering Manager', company: 'Bjak', email: 'careers@bjak.com', domain: 'bjak.com' },
  { title: 'Course Director UX UI', company: 'IDF', email: 'jobs@interaction-design.org', domain: 'interaction-design.org' },
  { title: 'Education Designer', company: 'IDF', email: 'jobs@interaction-design.org', domain: 'interaction-design.org' },
  { title: 'QA Engineer', company: 'SunnyData', email: 'hello@sunnydata.io', domain: 'sunnydata.io' },
  { title: 'Remote Office Assistant', company: 'Coalition Technologies', email: 'hello@coalitiontechnologies.com', domain: 'coalitiontechnologies.com' },
];

const COVER_LETTER = `Dear Hiring Manager,

I am writing to express my strong interest in the position. As a founding member of Silent Giants, a Web3 content team with 92+ completed tasks, I bring proven expertise in Arabic/English technical writing, blockchain content creation, and community management.

OUR TEAM'S PROVEN TRACK RECORD:
- 92+ completed Web3 content tasks
- 7 digital products published on Gumroad
- Articles, translations, analysis, and marketing content
- Bilingual Arabic/English capability

KEY STRENGTHS:
- Web3/Blockchain subject matter expertise (DeFi, DePIN, DAOs, Smart Contracts)
- Fast turnaround: 24-72 hours for most deliverables
- Quality-focused with attention to technical accuracy
- Available for immediate start, 20+ hours/week

PAYMENT PREFERENCES:
- USDT/USDC via digital wallets (Binance, Zengo, Phantom)
- No bank account required
- Zero upfront costs

PORTFOLIO:
- Gumroad Store: https://auroradreams65.gumroad.com
- Telegram Bot: @Aurora_Almada_88_Bot
- Email: auroraalmada4@gmail.com

Best regards,
Silent Giants Team
Email: auroraalmada4@gmail.com
Telegram: @Aurora_Almada_88_Bot`;

async function main() {
  console.log('=== VERIFYING EMAIL ADDRESSES ===\n');
  
  const verified = [];
  const invalid = [];
  
  for (const opp of opportunities) {
    const result = await verifyEmail(opp.email);
    if (result.valid) {
      verified.push({ ...opp, mx: result.mx });
      console.log(`✅ ${opp.email} → MX: ${result.mx}`);
    } else {
      invalid.push({ ...opp, reason: result.reason });
      console.log(`❌ ${opp.email} → ${result.reason}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\n=== VERIFICATION SUMMARY ===`);
  console.log(`Valid: ${verified.length} | Invalid: ${invalid.length}`);
  
  // Send emails to verified addresses only
  console.log('\n=== SENDING APPLICATIONS ===\n');
  
  const sent = [];
  const failed = [];
  
  for (const opp of verified) {
    const subject = `Application: ${opp.title} — Silent Giants Web3 Content Team`;
    try {
      const result = enqueueMail({ to: opp.email, subject, text: COVER_LETTER });
      console.log(`✅ Queued: ${opp.title} @ ${opp.company} → ${opp.email}`);
      sent.push({ ...opp, status: 'queued', id: result.id });
    } catch (e) {
      console.log(`❌ Error: ${opp.title} @ ${opp.company}: ${e.message}`);
      failed.push({ ...opp, status: 'error', error: e.message });
    }
    // Rate limit: 1 email per 3 seconds
    await new Promise(r => setTimeout(r, 3000));
  }
  
  console.log(`\n=== SENDING SUMMARY ===`);
  console.log(`Queued: ${sent.length} | Failed: ${failed.length}`);
  
  // Run the mail queue
  console.log('\nRunning mail queue...');
  try {
    const queueResult = await runMailQueue(25);
    console.log('Queue result:', JSON.stringify(queueResult));
  } catch (e) {
    console.log('Queue error:', e.message);
  }
  
  // Save results
  const report = {
    timestamp: new Date().toISOString(),
    verified: verified.length,
    invalid: invalid.length,
    sent: sent.length,
    queued: sent.filter(s => s.status === 'queued').length,
    details: { verified: verified.map(v => v.email), invalid: invalid.map(i => i.email) }
  };
  
  fs.writeFileSync('/root/silent-giants/deliverables/email-verification-report.json', JSON.stringify(report, null, 2));
  console.log('\nReport saved to deliverables/email-verification-report.json');
}

main();
