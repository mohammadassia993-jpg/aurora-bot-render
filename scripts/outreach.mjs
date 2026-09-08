import nodemailer from 'nodemailer';

const SMTP_USER = 'Mohammadassia993@gmail.com';
const SMTP_PASS = 'smsusatmgawyndfp';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  tls: { rejectUnauthorized: false }
});

const PROJECTS = [
  { name: 'Solana Foundation', email: 'grants@solana.org', focus: 'Solana ecosystem grants' },
  { name: 'Render Network', email: 'partnerships@render.net', focus: 'Render decentralized GPU rendering' },
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
auroraalmada4@gmail.com`;
}

const results = [];
for (const project of PROJECTS) {
  try {
    console.log(`📧 Sending to ${project.name} (${project.email})...`);
    const info = await transporter.sendMail({
      from: `"Silent Giants" <${SMTP_USER}>`,
      to: project.email,
      subject: 'Silent Giants — Web3 Content & Marketing Partnership',
      text: buildBody(project)
    });
    results.push({ name: project.name, email: project.email, ok: true, messageId: info.messageId });
    console.log(`  ✅ Sent! MessageID: ${info.messageId}`);
  } catch (e) {
    results.push({ name: project.name, email: project.email, ok: false, error: e.message });
    console.log(`  ❌ Failed: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 1500));
}

console.log('\n=== SUMMARY ===');
console.log(`Sent: ${results.filter(r=>r.ok).length}/${results.length}`);
console.log(JSON.stringify(results, null, 2));
