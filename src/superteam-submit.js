import { spawn } from 'node:child_process';
import path from 'node:path';
import { config } from './config.js';
import { audit } from './audit.js';
import { info, warn } from './logger.js';

export async function runBrowserSubmissions() {
  if (!config.superteamPassword) {
    return { error: 'SUPERTEAM_PASSWORD_NOT_SET' };
  }
  
  const scriptPath = path.join(config.root, 'scripts', 'submit-via-browser.js');
  
  return new Promise((resolve) => {
    info('superteam', 'starting browser submissions...');
    audit('executor', 'browser_submission_started', { script: scriptPath });
    
    const child = spawn('node', [scriptPath], {
      env: {
        ...process.env,
        SUPERTEAM_PASSWORD: config.superteamPassword,
        SUPERTEAM_EMAIL: config.officialEmail || 'auroraalmada4@gmail.com'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let output = '';
    let errors = '';
    
    child.stdout.on('data', data => { output += data.toString(); });
    child.stderr.on('data', data => { errors += data.toString(); });
    
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      warn('superteam', 'submission script timed out (15 min)');
      resolve({ error: 'TIMEOUT', output, errors });
    }, 15 * 60 * 1000);
    
    child.on('close', code => {
      clearTimeout(timeout);
      info('superteam', `submission script exited with code ${code}`);
      audit('executor', 'browser_submission_completed', { code, outputLength: output.length, hasErrors: errors.length > 0 });
      resolve({ code, output, errors });
    });
  });
}
