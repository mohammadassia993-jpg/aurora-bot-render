// researcher-agent.js — Autonomous AI news researcher
import { db } from './db.js';
import { callModel } from './ai.js';
import { info, warn, error } from './logger.js';

const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DAILY_REPORT_HOUR = 10;
const INITIAL_DELAY_MS = 5 * 60 * 1000;

let lastDailyReportDay = null;
let lastScanAt = null;
let totalFindings = 0;

db.exec('CREATE TABLE IF NOT EXISTS research_findings (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, title TEXT NOT NULL, url TEXT DEFAULT "", description TEXT DEFAULT "", relevance_score REAL DEFAULT 0, relevance_reason TEXT DEFAULT "", actionable INTEGER DEFAULT 0, seen_at TEXT DEFAULT CURRENT_TIMESTAMP)');

export function getStats() {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM research_findings').get().c;
    const today = db.prepare("SELECT COUNT(*) as c FROM research_findings WHERE seen_at >= datetime('now', '-24 hours')").get().c;
    const actionable = db.prepare('SELECT COUNT(*) as c FROM research_findings WHERE actionable = 1').get().c;
    return { total, today, actionable, lastScanAt, totalFindings };
  } catch (e) { return { total: 0, today: 0, actionable: 0, lastScanAt, totalFindings }; }
}

export function getRecentFindings(limit) {
  try { return db.prepare('SELECT * FROM research_findings ORDER BY seen_at DESC LIMIT ?').all(limit || 20); }
  catch (e) { return []; }
}
