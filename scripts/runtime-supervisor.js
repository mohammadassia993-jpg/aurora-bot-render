import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const lockPath = path.join(root, 'runtime-supervisor.lock');
const pidPath = path.join(root, 'runtime-supervisor.pid');
const servicePidPath = path.join(root, 'service-pids.json');

fs.mkdirSync(root, { recursive: true });
try {
  const lock = fs.openSync(lockPath, 'wx');
  fs.writeFileSync(lock, `${process.pid}\n`);
  fs.closeSync(lock);
} catch {
  let active = false;
  try {
    const pid = Number(fs.readFileSync(pidPath, 'utf8').trim());
    active = Number.isFinite(pid) && pid > 0 && pid !== process.pid && fs.existsSync(`/proc/${pid}`);
  } catch {}
  if (active) {
    console.log(`supervisor: already active pid=${fs.readFileSync(pidPath, 'utf8').trim()}`);
    process.exit(0);
  }
  fs.rmSync(lockPath, { force: true });
  const lock = fs.openSync(lockPath, 'wx');
  fs.writeFileSync(lock, `${process.pid}\n`);
  fs.closeSync(lock);
}
fs.writeFileSync(pidPath, `${process.pid}\n`);

const services = [];
if ((process.env.TELEGRAM_PROXY_URL || '').startsWith('socks5h://127.0.0.1:9050')) {
  services.push({ name: 'tor', command: 'tor', args: ['--SocksPort', '9050', '--DataDirectory', '/tmp/aurora-tor'] });
}
if (process.env.CLOUDFLARED_TUNNEL_TOKEN) {
  services.push({ name: 'tunnel', command: 'bash', args: ['deploy/cloudflare-supervisor.sh'] });
} else if (process.env.TELEGRAM_PUBLIC_TUNNEL_ENABLED === 'true') {
  services.push({ name: 'pinggy', command: 'bash', args: ['deploy/pinggy-supervisor.sh'] });
}
services.push(
  { name: 'ollama', command: 'bash', args: ['deploy/ollama-start.sh'] },
  { name: 'platform', command: process.execPath, args: ['src/index.js'] },
  { name: 'watchdog', command: 'bash', args: ['deploy/aurora-watchdog.sh'] },
  { name: 'zeroclaw', command: '/root/zeroclaw/bin/zeroclaw', args: ['--config-dir', '/root/zeroclaw/config', 'daemon'] },
  { name: 'backup-keepalive', command: 'bash', args: ['deploy/backup-keepalive.sh'] }
);

const children = new Map();
let stopping = false;

function persistPids() {
  const payload = Object.fromEntries([...children].map(([name, child]) => [name, child.pid]));
  fs.writeFileSync(servicePidPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function start(service) {
  if (stopping || children.has(service.name)) return;
  const logPath = path.join(root, 'logs', `${service.name}.log`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const output = fs.openSync(logPath, 'a');
  const child = spawn(service.command, service.args, {
    cwd: root,
    env: { ...process.env, AURORA_SUPERVISOR: '1' },
    stdio: ['ignore', output, output]
  });
  fs.closeSync(output);
  children.set(service.name, child);
  persistPids();
  console.log(`${new Date().toISOString()} ${service.name}: started pid=${child.pid}`);
  child.on('exit', (code, signal) => {
    if (children.get(service.name) === child) children.delete(service.name);
    persistPids();
    if (stopping) return;
    console.error(`${new Date().toISOString()} ${service.name}: exited code=${code} signal=${signal}; restart in 5s`);
    setTimeout(() => start(service), 5000).unref();
  });
}

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 3000).unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
for (const service of services) start(service);

process.on('exit', () => {
  try { fs.rmSync(lockPath, { force: true }); } catch {}
});

