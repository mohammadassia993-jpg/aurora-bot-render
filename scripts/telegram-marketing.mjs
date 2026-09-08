const BOT_TOKEN = '8964456145:AAFyf-2Z_oTp4DaGt692QhGwRVHVDQjzxf0';
const CHANNEL_ID = '-1003836853169';
const CHAT_ID = '888229115';

const CONTENTS = [
  {
    text: `🌐 *oggled Giants — خدمات Web3 احترافية*

نقدم لكم خدماتنا المتكاملة في عالم Web3:

📝 *كتابة المحتوى التقني* — مقالات ومراجعات للمشاريع
🌐 *الترجمة* — عربي/إنجليزي للمحتوى التقني
📊 *التحليل والتقارير* — تقارير أسبوعية عن السوق
🎯 *التسويق* — حملات تسويقية للمشاريع

✅ أكثر من 92 مهمة مكتملة
⚡ أسعار تنافسية وتسليم سريع

📩 للتواصل: @Aurora_Almada_88_Bot
📧 auroraalmada4@gmail.com`
  },
  {
    text: `🔥 *Weekly Web3 Digest —.sep 8, 2026*

*Top 5 Web3 Opportunities This Week:*

1️⃣ *Solana Render Hackathon* — $50K Prize Pool
   🏆 forestry-track: Build DePIN applications
   📅 Deadline: Sep 15

2️⃣ *Filecoin Storage Challenge* — 300 FIL
   🏆 Build data tools on FVM
   📅 Deadline: Sep 20

3️⃣ *Polygon DeFi Bounty* — $20K
   🏆 Create innovative DeFi tools
   📅 Ongoing

4️⃣ *Algorand Blockchain Competition*
   🏆 Build on Algorand
   📅 Deadline: Sep 18

5️⃣ *Berachain Early Builder Program*
   🏆 early bounties available
   📅 Open

💬 Need help with any of these? Contact us for end-to-end support!
🤖 @Aurora_Almada_88_Bot`
  },
  {
    text: `📊 *Silent Giants Performance Update*

✅ *Tasks Completed:* 92+
📧 *Outreach Sent:* 12 emails to major Web3 projects
🌐 *Platforms Active:* Gumroad, Telegram, Email
🎯 *Current Focus:* Partnership development

*Projects We've Reached Out To:*
- Solana Foundation
- Render Network
- Filecoin
- Chainlink
- Polygon Labs
- Arweave
- Algorand Foundation
- Celestia
- Movement Labs
- Berachain
- Aptos Foundation
- Sui Foundation

💰 *Revenue Target:* $1000 in 7 days
📈 *Progress:* Actively building partnerships

Next report in 6 hours via bot! 🤖`
  }
];

async function sendToChannel(text, parseMode = 'Markdown') {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHANNEL_ID, text, parse_mode: parseMode, disable_web_page_preview: true })
  });
  const data = await res.json();
  return data;
}

async function sendToCommander(text) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' })
  });
  return await res.json();
}

const results = [];
console.log('📱 Starting Telegram channel posting...');

for (const [i, content] of CONTENTS.entries()) {
  console.log(`\n[${i+1}/3] Posting to channel...`);
  try {
    const r = await sendToChannel(content.text);
    if (r.ok) {
      results.push({ index: i+1, ok: true, msgId: r.result.message_id });
      console.log(`  ✅ Posted! msg_id: ${r.result.message_id}`);
    } else {
      results.push({ index: i+1, ok: false, error: r.description });
      console.log(`  ❌ Failed: ${r.description}`);
    }
  } catch (e) {
    results.push({ index: i+1, ok: false, error: e.message });
    console.log(`  ❌ Error: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 1500));
}

console.log('\n=== RESULTS ===');
console.log(`Posted: ${results.filter(r=>r.ok).length}/${results.length}`);
console.log(JSON.stringify(results, null, 2));

// Send summary to commander
const summary = results.filter(r=>r.ok).map(r => `✅ Post #${r.index} sent (msg_id: ${r.msgId})`).join('\n');
await sendToCommander(`📢 *Tikarj Marketing Report*\n\n${summary}\n\nTotal: ${results.filter(r=>r.ok).length} posts published on channel`);
