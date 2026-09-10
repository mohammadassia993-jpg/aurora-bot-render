import { db } from '../db.js';
import { enqueueMail, runMailQueue } from '../mail.js';
import { info } from '../logger.js';

const COVER = `Dear Hiring Manager,

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

const applications = [
  { title: 'Freelance Writer', company: 'IAPWE', to: 'jobs@iapwe.org' },
  { title: 'Freelance Copywriter', company: 'Coalition Technologies', to: 'careers@coalitiontechnologies.com' },
  { title: 'Content Reviewer', company: 'TELUS Digital', to: 'careers@telusinternational.com' },
  { title: 'Junior Crypto Analyst', company: 'Empire Assets', to: 'hr@empireassets.io' },
  { title: 'Social Comms', company: 'NOPE', to: 'jobs@nope.com' },
  { title: 'Head of Marketing', company: 'garden3d', to: 'careers@garden3d.io' },
  { title: 'Course Writer', company: 'Interaction Design Foundation', to: 'jobs@interaction-design.org' }
];

const results = [];

for (const app of applications) {
  const subject = `Application: ${app.title} — Silent Giants Web3 Content Team`;
  try {
    const result = enqueueMail({ to: app.to, subject, text: COVER });
    console.log(`✅ Queued: ${app.title} @ ${app.company} → ${app.to} (id: ${result.id})`);
    results.push({ ...app, status: 'queued', id: result.id });
    
    // Record in tasks
    db.prepare(`INSERT INTO tasks (title, description, source, status, priority, created_at) VALUES (?, ?, 'job_apply', 'applied', 'high', CURRENT_TIMESTAMP)`).run(
      `Email application: ${app.title} @ ${app.company}`,
      `To: ${app.to} | Subject: ${subject}`
    );
  } catch (e) {
    console.log(`❌ Error: ${app.title} @ ${app.company}: ${e.message}`);
    results.push({ ...app, status: 'error', error: e.message });
  }
}

console.log(`\n=== QUEUED: ${results.filter(r => r.status === 'queued').length} emails ===`);

// Try to send immediately
console.log('\nRunning mail queue...');
try {
  const queueResult = await runMailQueue();
  console.log('Queue result:', JSON.stringify(queueResult));
} catch (e) {
  console.log('Queue error:', e.message);
}

// Summary
const stats = { queued: results.filter(r => r.status === 'queued').length, errors: results.filter(r => r.status === 'error').length };
console.log('\n=== FINAL ===');
console.log(JSON.stringify(stats));
results.forEach(r => console.log(`  ${r.status}: ${r.title} @ ${r.company}`));
