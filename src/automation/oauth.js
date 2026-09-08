import { info, warn } from '../logger.js';
import { db } from '../db.js';

db.exec(`CREATE TABLE IF NOT EXISTS oauth_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  session_data TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT
)`);

export async function loginGitcoin(email, password) {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://gitcoin.co/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    const cookies = await page.context().cookies();
    await browser.close();
    db.prepare("INSERT INTO oauth_sessions(platform, session_data) VALUES (?, ?)").run('gitcoin', JSON.stringify(cookies));
    info('oauth', 'Gitcoin login successful');
    return { success: true };
  } catch (e) { warn('oauth', 'Gitcoin login failed: ' + e.message); return { success: false, error: e.message }; }
}

export async function loginAlgora(email, password) {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://algora.io/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    const cookies = await page.context().cookies();
    await browser.close();
    db.prepare("INSERT INTO oauth_sessions(platform, session_data) VALUES (?, ?)").run('algora', JSON.stringify(cookies));
    info('oauth', 'Algora login successful');
    return { success: true };
  } catch (e) { warn('oauth', 'Algora login failed: ' + e.message); return { success: false, error: e.message }; }
}

export async function loginImmunefi(email, password) {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://immunefi.com/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    const cookies = await page.context().cookies();
    await browser.close();
    db.prepare("INSERT INTO oauth_sessions(platform, session_data) VALUES (?, ?)").run('immunefi', JSON.stringify(cookies));
    info('oauth', 'Immunefi login successful');
    return { success: true };
  } catch (e) { warn('oauth', 'Immunefi login failed: ' + e.message); return { success: false, error: e.message }; }
}

export default { loginGitcoin, loginAlgora, loginImmunefi };
