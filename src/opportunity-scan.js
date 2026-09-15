import { db } from './db.js';
import { info } from './logger.js';
import { audit } from './audit.js';

/**
 * opportunity-scan.js — CANCELLED (leader order 2026-09-15).
 *
 * The old job-board scanning system (RemoteOK + Remotive) is permanently banned.
 * No job-board rows may ever be created or sent again. The new system sources
 * opportunities ONLY from verified bounty platforms (Superteam Earn, GitHub
 * Security, Immunefi) with a hard reward floor of >= $200.
 *
 * These functions are intentionally disabled; a final gate also blocks any
 * reward='N/A' or remotive.com link from reaching Telegram.
 */

export async function scanRealOpportunities() {
  // Final purge: delete any remaining job-board rows (defense in depth).
  const purged = db.prepare("DELETE FROM tasks WHERE source IN ('jobs','remotive','remoteok','opportunity')").run().changes;
  info('opportunity-scan', `legacy job-board scan DISABLED; purged remaining rows=${purged}`);
  audit('executor', 'legacy_scan_disabled', { purged, reason: 'leader_order_2026-09-15' });
  return { purged, total: 0, results: [] };
}

export default { scanRealOpportunities };
