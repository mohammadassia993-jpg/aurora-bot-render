import tls from 'node:tls';

const user = 'Mohammadassia993@gmail.com';
const pass = 'smsusatmgawyndfp';

function readLine(socket, timeout = 8000) {
  return new Promise(resolve => {
    let buf = '';
    const onData = c => { buf += c.toString(); const i = buf.search(/\r?\n/); if (i > -1) { socket.off('data', onData); clearTimeout(t); resolve(buf.slice(0, i)); } };
    const t = setTimeout(() => { socket.off('data', onData); resolve(buf || 'TIMEOUT'); }, timeout);
    socket.on('data', onData);
  });
}

async function main() {
  const s = tls.connect({ host: 'imap.gmail.com', port: 993, servername: 'imap.gmail.com' });
  await new Promise((r, j) => { s.once('ready', r); s.once('error', j); });
  await readLine(s);
  
  s.write('A001 LOGIN "' + user + '" "' + pass + '"\r\n');
  console.log('Login:', (await readLine(s)).slice(0, 40));
  
  s.write('A002 SELECT INBOX\r\n');
  for (let i = 0; i < 10; i++) { const l = await readLine(s, 3000); if (l.includes('A002 OK')) break; }
  
  // Fetch recent unseen messages
  s.write('A003 FETCH 170:178 BODY[HEADER.FIELDS (FROM SUBJECT DATE)]\r\n');
  let data = '';
  for (let i = 0; i < 20; i++) {
    const l = await readLine(s, 5000);
    data += l + '\n';
    if (l.includes('A003 OK')) break;
  }
  
  // Parse
  const messages = data.split(/\* \d+ FETCH/);
  console.log('\n=== Recent Unseen Messages ===');
  for (const msg of messages) {
    const from = msg.match(/From:\s*(.*)/i);
    const subj = msg.match(/Subject:\s*(.*)/i);
    const date = msg.match(/Date:\s*(.*)/i);
    if (from) {
      console.log('From:', from[1].trim().slice(0, 80));
      console.log('Subject:', (subj?.[1] || '').trim().slice(0, 80));
      console.log('Date:', (date?.[1] || '').trim().slice(0, 40));
      console.log('---');
    }
  }
  
  s.write('A004 LOGOUT\r\n');
  await readLine(s);
  s.destroy();
}

main().catch(e => console.log('Error:', e.message));
