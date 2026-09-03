import { deliverMail } from '../src/mail.js';

const emails = [
  {
    to: 'partnerships@solana.com',
    subject: 'Arabic Web3 Content Partnership — Silent Giants',
    text: `Dear Solana Team,

We're Silent Giants, a specialized Arabic Web3 content team.

We'd like to offer our services for Arabic content creation for the Solana ecosystem:
- Technical articles about Solana projects (in Arabic)
- Community management for Arabic-speaking users
- Translation of Solana documentation (EN→AR)
- Educational content for Arabic Web3 beginners

Portfolio: 92+ completed tasks including articles, translations, and analyses.
Delivery: 24-72 hours
Payment: USDT/USDC

Would you be open to a quick conversation about content needs for the Arabic market?

Best regards,
Silent Giants Team
📧 auroraalmada4@gmail.com
🔗 https://mohammadassia993-jpg.github.io/aurora-bot-render/`
  },
  {
    to: 'content@rendernetwork.com',
    subject: 'Arabic Content Services for Render Network — Silent Giants',
    text: `Dear Render Network Team,

We're Silent Giants, a team specializing in Web3 content in Arabic and English.

We noticed Render Network's growing presence and would love to help create Arabic content:
- Technical deep-dives on Render's GPU rendering
- Educational articles for Arabic audiences
- Community engagement content
- Translation of key documentation

Our portfolio includes 92+ completed Web3 content tasks.
Available immediately. Payment via USDT.

Interested in discussing content needs?

Best regards,
Silent Giants Team
📧 auroraalmada4@gmail.com`
  },
  {
    to: 'team@filecoin.io',
    subject: 'Arabic Content Partnership — Filecoin Ecosystem',
    text: `Dear Filecoin Team,

We're Silent Giants, offering Arabic Web3 content services.

We can help Filecoin reach the Arabic-speaking audience:
- Articles about Filecoin/IPFS in Arabic
- Technical documentation translation
- Community content for MENA region
- Educational guides for Arabic users

92+ completed tasks. Fast delivery (24-72h).
Payment: USDT/USDC.

Open to partnership?

Best regards,
Silent Giants Team
📧 auroraalmada4@gmail.com`
  },
  {
    to: 'info@helium.com',
    subject: 'Arabic Content for Helium Network — Silent Giants',
    text: `Dear Helium Team,

We're Silent Giants, a Web3 content team focused on Arabic markets.

Services for Helium:
- Arabic articles about Helium/DePIN
- Community management for Arabic users
- Translation of Helium documentation
- Educational content for MENA region

Portfolio: 92+ tasks. Delivery: 24-72h.
Payment: USDT.

Interested?

Best regards,
Silent Giants Team
📧 auroraalmada4@gmail.com`
  },
  {
    to: 'hello@arweave.org',
    subject: 'Arabic Content Services — Arweave Ecosystem',
    text: `Dear Arweave Team,

We're Silent Giants, specializing in Arabic Web3 content.

We can help Arweave grow in the Arabic market:
- Technical articles about Arweave/AO in Arabic
- Community engagement content
- Documentation translation (EN→AR)
- Educational guides

92+ completed tasks. Immediate availability.
Payment: USDT/USDC.

Best regards,
Silent Giants Team
📧 auroraalmada4@gmail.com`
  }
];

console.log('🚀 Starting email outreach...');
let sent = 0;
let failed = 0;

for (const email of emails) {
  try {
    console.log(`📧 Sending to ${email.to}...`);
    const result = await deliverMail(email);
    console.log(`  ✅ Sent: ${JSON.stringify(result).slice(0, 100)}`);
    sent++;
  } catch (e) {
    console.log(`  ❌ Failed: ${e.message}`);
    failed++;
  }
  // Wait 2 seconds between emails
  await new Promise(r => setTimeout(r, 2000));
}

console.log(`\n📊 Results: ${sent} sent, ${failed} failed out of ${emails.length}`);
