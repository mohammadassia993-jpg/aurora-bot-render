import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const platformRoot = path.resolve(import.meta.dirname, '..');
const pidPath = path.join(platformRoot, 'runtime-supervisor.pid');

export default {
  id: 'aurora-supervisor',
  name: 'Aurora Supervisor',
  description: 'Keeps the Aurora Silent Giants platform, watchdog, and tunnel alive.',
  register(api) {
    let child;
    let timer;
    let failures = 0;
    let restarting = false;

    async function healthy() {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        const response = await fetch('http://127.0.0.1:8787/health', { signal: controller.signal });
        clearTimeout(timer);
        return response.ok;
      } catch {
        return false;
      }
    }

    function isAlive() {
      return Boolean(child && child.exitCode === null && child.pid);
    }

    function startSupervisor() {
      if (isAlive() || restarting) return;
      restarting = true;
      child = spawn(process.execPath, ['scripts/runtime-supervisor.js'], {
        cwd: platformRoot,
        detached: true,
        stdio: 'ignore',
        env: process.env
      });
      child.unref();
      fs.writeFileSync(pidPath, `${child.pid}\n`, { mode: 0o600 });
      api.logger.info(`aurora-supervisor: started supervisor pid=${child.pid}`);
      child.on('exit', (code, signal) => {
        api.logger.warn(`aurora-supervisor: supervisor exited code=${code} signal=${signal}`);
      });
      setTimeout(() => { restarting = false; }, 5000).unref();
    }

    api.registerService({
      id: 'aurora-platform',
      async start() {
        if (!(await healthy())) startSupervisor();
        timer = setInterval(async () => {
          if (isAlive()) return;
          if (await healthy()) return;
          failures += 1;
          if (failures >= 2) {
            failures = 0;
            startSupervisor();
          }
        }, 5000);
        timer.unref();
      },
      async stop() {
        clearInterval(timer);
        if (!isAlive()) return;
        try { process.kill(-child.pid, 'SIGTERM'); }
        catch { child.kill('SIGTERM'); }
      }
    });
  }
};
