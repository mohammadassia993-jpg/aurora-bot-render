import net from 'node:net';
import tls from 'node:tls';

const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 587;
const SMTP_USER = 'Mohammadassia993@gmail.com';
const SMTP_PASS = 'smsusatmgawyndfp';

const PROJECTS = [
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

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildEmail(project) {
  const body = `Hi ${project.name} Team,

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

  return [
    `From: Silent Giants <auroraalmada4@gmail.com>`,
    `To: ${project.email}`,
    `Subject: Silent Giants — Web3 Content & Marketing Partnership`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
  ].join('\r\n');
}

function createSocket() {
  return new Promise((resolve, reject) => {
    const socket = net.connect(SMTP_PORT, SMTP_HOST);
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
    socket.setTimeout(10000, () => reject(new Error('CONNECT_TIMEOUT')));
  });
}

function readAll(socket, timeout = 8000) {
  return new Promise((resolve) => {
    let buf = '';
    const onD = c => { buf += c.toString(); };
    socket.on('data', onD);
    setTimeout(() => { socket.off('data', onD); resolve(buf); }, timeout);
  });
}

async function smtpExchange(socket, commands) {
  const responses = [];
  for (const cmd of commands) {
    socket.write(cmd + '\r\n');
    await wait(1000);
    const resp = await readAll(socket, 5000);
    responses.push(resp);
  }
  return responses;
}

async function sendOne(project, index) {
  const results = { project: project.name, email: project.email };
  try {
    console.log(`\n[${index+1}] Sending to ${project.name}...`);
    const socket = await createSocket();
    const greeting = await readAll(socket, 3000);
    console.log('Greeting:', greeting.slice(0, 60));

    // EHLO
    socket.write('EHLO silent-giants.com\r\n');
    await wait(1500);
    const ehloResp = await readAll(socket);
    console.log('EHLO:', ehloResp.slice(0, 60));

    // STARTTLS
    socket.write('STARTTLS\r\n');
    await wait(1000);
    const tlsResp = await readAll(socket);
    console.log('STARTTLS:', tlsResp.slice(0, 60));

    // Upgrade to TLS
    const tlsSocket = new Promise((resolve, reject) => {
      const upgraded = tls.connect({ socket, servername: SMTP_HOST }, () => resolve(upgraded));
      upgraded.once('error', reject);
      setTimeout(() => reject(new Error('TLS_TIMEOUT')), 10000);
    });
    const secureSocket = await tlsSocket;
    await wait(500);

    // EHLO again after TLS
    secureSocket.write('EHLO silent-giants.com\r\n');
    await wait(1000);
    const ehlo2 = await readAll(secureSocket);
    console.log('EHLO2:', ehlo2.slice(0, 60));

    // AUTH LOGIN
    secureSocket.write('AUTH LOGIN\r\n');
    await wait(1000);
    const authResp = await readAll(secureSocket);
    console.log('AUTH:', authResp.slice(0, 40));
    secureSocket.write(Buffer.from(SMTP_USER).toString('base64') + '\r\n');
    await wait(1000);
    await readAll(secureSocket);
    secureSocket.write(Buffer.from(SMTP_PASS).toString('base64') + '\r\n');
    await wait(1000);
    const passResp = await readAll(secureSocket);
    console.log('PASS:', passResp.slice(0, 60));
    if (passResp.includes('535')) {
      results.success = false;
      results.error = 'AUTH_FAILED';
      secureSocket.destroy();
      return results;
    }

    // MAIL FROM / RCPT TO
    secureSocket.write(`MAIL FROM:<auroraalmada4@gmail.com>\r\n`);
    await wait(1000);
    const mailResp = await readAll(secureSocket);
    console.log('MAIL:', mailResp.slice(0, 40));

    secureSocket.write(`RCPT TO:<${project.email}>\r\n`);
    await wait(1000);
    const rcptResp = await readAll(secureSocket);
    console.log('RCPT:', rcptResp.slice(0, 40));

    // DATA
    secureSocket.write('DATA\r\n');
    await wait(1000);
    const dataResp = await readAll(secureSocket);
    console.log('DATA:', dataResp.slice(0, 40));

    // Send message
    const emailMsg = buildEmail(project);
    secureSocket.write(emailMsg + '\r\n.\r\n');
    await wait(2000);
    const msgResp = await readAll(secureSocket);
    console.log('SENT:', msgResp.slice(0, 60));

    secureSocket.write('QUIT\r\n');
    await wait(500);
    secureSocket.destroy();

    const ok = msgResp.includes('250') || msgResp.includes('OK');
    results.success = ok;
    results.serverResponse = msgResp.slice(0, 100);
    console.log(ok ? '✅ Sent!' : '⚠️ Uncertain:', msgResp.slice(0, 80));
  } catch (e) {
    results.success = false;
    results.error = e.message;
    console.log('❌ Error:', e.message);
  }
  return results;
}

console.log('=== Silent Giants Outreach System ===');
console.log(`Targeting ${Math.min(PROJECTS.length, 3)} projects...`);
const allResults = [];

for (let i = 0; i < Math.min(PROJECTS.length, 3); i++) {
  allResults.push(await sendOne(PROJECTS[i], i));
  await wait(3000);
}

console.log('\n=== FINAL RESULTS ===');
console.log(JSON.stringify(allResults, null, 2));
