import { config } from '../config.js';
import { db } from '../db.js';

// Email-based job applications
const applications = [
  {
    title: 'Freelance Writer',
    company: 'IAPWE',
    to: 'jobs@iapwe.org',
    subject: 'Application: Freelance Writer — Silent Giants Web3 Content Team'
  },
  {
    title: 'Freelance Copywriter', 
    company: 'Coalition Technologies',
    to: 'careers@coalitiontechnologies.com',
    subject: 'Application: Freelance Copywriter — Silent Giants Web3 Content Team'
  },
  {
    title: 'Content Reviewer',
    company: 'TELUS Digital',
    to: 'careers@telusinternational.com',
    subject: 'Application: Content Reviewer — Silent Giants Web3 Content Team'
  },
  {
    title: 'Junior Crypto Analyst',
    company: 'Empire Assets',
    to: 'hr@empireassets.io',
    subject: 'Application: Junior Crypto Analyst — Silent Giants Web3 Content Team'
  },
  {
    title: 'Social Comms',
    company: 'NOPE',
    to: 'jobs@nope.com',
    subject: 'Application: Social Comms — Silent Giants Web3 Content Team'
  }
];

const COVER_LETTER = `Dear Hiring Manager,

I am writing to express my strong interest in the position at your company. As a founding member of Silent Giants, a Web3 content team with 92+ completed tasks, I bring proven expertise in Arabic/English technical writing, blockchain content creation, and community management.

OUR TEAM'S PROVEN TRACK RECORD:
• 92+ completed Web3 content tasks
• 7 digital products published on Gumroad
• Articles, translations, analysis, and marketing content
• Bilingual Arabic/English capability

KEY STRENGTHS:
• Web3/Blockchain subject matter expertise (DeFi, DePIN, DAOs, Smart Contracts)
• Fast turnaround: 24-72 hours for most deliverables
• Quality-focused with attention to technical accuracy
• Available for immediate start, 20+ hours/week

PAYMENT PREFERENCES:
• USDT/USDC via digital wallets (Binance, Zengo, Phantom)
• No bank account required
• Zero upfront costs

PORTFOLIO:
• Gumroad Store: https://auroradreams65.gumroad.com
• Telegram Bot: @Aurora_Almada_88_Bot
• Email: auroraalmada4@gmail.com

I would welcome the opportunity to discuss how Silent Giants can contribute to your team's success.

Best regards,
Silent Giants Team
Email: auroraalmada4@gmail.com
Telegram: @Aurora_Almada_88_Bot`;

const results = [];

for (const app of applications) {
  console.log(`\nSending: ${app.title} @ ${app.company}`);
  console.log(`To: ${app.to}`);
  
  try {
    // Enqueue the email
    const { enqueueMail } = await import('../mail.js');
    const mailId = await enqueueMail({
      to: app.to,
      subject: app.subject,
      body: COVER_LETTER,
      from: config.officialEmail || 'auroraalmada4@gmail.com'
    });
    
    console.log(`✅ Email queued: ${mailId}`);
    results.push({ ...app, status: 'queued', mailId });
    
    // Record in database
    db.prepare(`
      INSERT INTO tasks (title, description, source, status, priority, created_at)
      VALUES (?, ?, 'job_apply', 'applied', 'high', CURRENT_TIMESTAMP)
    `).run(
      `Email application: ${app.title} @ ${app.company}`,
      `Sent to: ${app.to}\nSubject: ${app.subject}`
    );
    
  } catch (e) {
    console.log(`❌ Error: ${e.message}`);
    results.push({ ...app, status: 'error', error: e.message });
  }
}

console.log('\n=== SUMMARY ===');
console.log(`Total: ${results.length}`);
console.log(`Queued: ${results.filter(r => r.status === 'queued').length}`);
console.log(`Errors: ${results.filter(r => r.status === 'error').length}`);
results.forEach(r => console.log(`  ${r.status}: ${r.title} @ ${r.company}`));

// Try to send the queue immediately
try {
  const { runMailQueue } = await import('../mail.js');
  console.log('\nRunning mail queue...');
  const queueResult = await runMailQueue();
  console.log('Queue result:', JSON.stringify(queueResult));
} catch (e) {
  console.log('Mail queue error:', e.message);
}

export default results;
