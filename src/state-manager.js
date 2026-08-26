import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const STATE_FILE = path.join(config.root, 'state', 'TEAM_STATE.md');

export function updateState(section, data) {
  try {
    if (!fs.existsSync(STATE_FILE)) return false;
    let content = fs.readFileSync(STATE_FILE, 'utf8');
    
    // Update timestamp
    content = content.replace(
      /> \*\*آخر تحديث:\*\* .*/,
      `> **آخر تحديث:** ${new Date().toISOString()}`
    );
    
    // Update specific section
    if (section === 'stats') {
      content = content.replace(
        /\| وقت التشغيل \|.*\|/,
        `| وقت التشغيل | ${data.uptime || 'مستمر'} |`
      );
      content = content.replace(
        /\| عدد الرسائل المعالجة \|.*\|/,
        `| عدد الرسائل المعالجة | ${data.messages || '—'} |`
      );
      content = content.replace(
        /\| عدد المهام المكتملة \|.*\|/,
        `| عدد المهام المكتملة | ${data.tasks || 0} |`
      );
    }
    
    if (section === 'task') {
      const date = new Date().toISOString().split('T')[0];
      const newEntry = `| ${date} | ${data.title} | ${data.assignee || 'أورورا'} |`;
      content = content.replace(
        /(\| آخر مزامنة GitHub \|.*\|)/,
        `${newEntry}\n$1`
      );
    }
    
    fs.writeFileSync(STATE_FILE, content);
    return true;
  } catch (e) {
    return false;
  }
}

export function getState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    return fs.readFileSync(STATE_FILE, 'utf8');
  } catch {
    return null;
  }
}

export function syncToGitHub() {
  try {
    const { execSync } = await import('node:child_process');
    execSync('bash /root/silent-giants/scripts/sync-state.sh', { timeout: 30000 });
    return true;
  } catch {
    return false;
  }
}
