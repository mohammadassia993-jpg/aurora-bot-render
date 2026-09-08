const BOT_TOKEN = '8964456145:AAFyf-2Z_oTp4DaGt692QhGwRVHVDQjzxf0';
const CHANNEL_ID = '-1003836853169';
const CHAT_ID = '888229115';

const contents = [
  "Silent Giants - Web3 Content & Marketing Agency\n\nWe provide comprehensive Web3 services:\n\n- Technical Writing: Articles and reviews for blockchain projects\n- Translation: Arabic/English technical content\n- Analysis & Reports: Weekly market reports\n- Marketing: Campaigns for Web3 projects\n\nWe completed 92+ tasks with competitive pricing and fast delivery.\n\nContact: @Aurora_Almada_88_Bot\nEmail: auroraalmada4@gmail.com",

  "Weekly Web3 Digest - Sep 8, 2026\n\nTop 5 Web3 Opportunities This Week:\n\n1. Solana Render Hackathon - 50K Prize Pool\n   Build DePIN applications\n   Deadline: Sep 15\n\n2. Filecoin Storage Challenge - 300 FIL\n   Build data tools on FVM\n   Deadline: Sep 20\n\n3. Polygon DeFi Bounty - 20K\n   Create innovative DeFi tools\n   Ongoing\n\n4. Algorand Blockchain Competition\n   Build on Algorand\n   Deadline: Sep 18\n\n5. Berachain Early Builder Program\n   Early bounties available\n   Open\n\nNeed help with any of these? Contact us!\nBot: @Aurora_Almada_88_Bot"
];

async function sendToChannel(text) {
  const url = "https://api.telegram.org/bot" + BOT_TOKEN + "/sendMessage";
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHANNEL_ID, text, disable_web_page_preview: true })
  });
  return await res.json();
}

const results = [];
for (let i = 0; i < contents.length; i++) {
  console.log("[" + (i+1) + "] Posting...");
  const r = await sendToChannel(contents[i]);
  if (r.ok) {
    results.push({ index: i+1, ok: true, msgId: r.result.message_id });
    console.log("  OK msg_id: " + r.result.message_id);
  } else {
    results.push({ index: i+1, ok: false, error: r.description });
    console.log("  FAIL: " + r.description);
  }
  await new Promise(res => setTimeout(res, 1500));
}

console.log(JSON.stringify(results));
