/**
 * self-healing-guard.js — حارس الأعطال الذكي (v2 مع فلاتر)
 *
 * الفلاتر المضافة:
 * - تجاهل الأخطاء الاختبارية (test, quiet_test, emergency, DEDUP_TEST)
 * - لا يُرسل إلا للseverity high/critical
 * - منع التكرار خلال 6 ساعات
 * - رسالة واحدة بدل رسالتين (عند notify_only)
 * - حد أقصى 3 إشعارات لكل دورة
 * - تجاهل الأخطاء الأقدم من ساعة
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';
import { info, warn } from './logger.js';
import { audit } from './audit.js';

const GUARD_ENABLED = process.env.SELF_HEALING_GUARD_ENABLED === 'true';

if (!GUARD_ENABLED) {
  info('self-healing-guard', '⏸ الحارس معطّل (SELF_HEALING_GUARD_ENABLED=false)');
}

// ─────────────────────────────────────────────
// فلاتر الضجيج
// ─────────────────────────────────────────────
const SKIP_SCOPES = ['test', 'quiet_test', 'emergency'];
const SKIP_TYPE_PATTERNS = [
  /^DEDUP_TEST/i,
  /^EMERGENCY_REQUEST/i,
  /^TEST_/i,
  /TEST$/i
];
const MIN_SEVERITY = process.env.GUARD_MIN_SEVERITY || 'high';
const DEDUP_WINDOW_HOURS = Number(process.env.GUARD_DEDUP_HOURS || 6);
const MAX_INCIDENTS_PER_RUN = 3;
const MAX_ERROR_AGE_HOURS = 1;
const SEVERITY_ORDER = { low: 1, medium: 2, high: 3, critical: 4 };

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS healing_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_error_id INTEGER DEFAULT 0,
  component TEXT DEFAULT 'unknown',
  error_type TEXT DEFAULT '',
  error_message TEXT DEFAULT '',
  root_cause TEXT DEFAULT '',
  repair_action TEXT DEFAULT '',
  severity TEXT DEFAULT 'medium',
  notified INTEGER DEFAULT 0,
  status TEXT DEFAULT 'detected',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS healing_status ON healing_incidents(status, created_at);
CREATE INDEX IF NOT EXISTS healing_dedup ON healing_incidents(component, error_type, created_at);
`);

const SRC_DIR = path.join(config.root, 'src');
const FILE_MEMORY_PATH = path.join(config.root, 'data', 'file-memory.json');
const LAST_SCAN_FILE = path.join(config.root, 'data', 'last-guard-scan.json');

// ─────────────────────────────────────────────
// ذاكرة الملفات
// ─────────────────────────────────────────────
function scanDirectory(dir, depth = 0, maxDepth = 3) {
  const files = [];
  if (depth > maxDepth) return files;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(config.root, fullPath);
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (entry.isDirectory()) {
        files.push({ type: 'dir', path: relativePath, name: entry.name });
        files.push(...scanDirectory(fullPath, depth + 1, maxDepth));
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          let preview = '';
          if (entry.name.endsWith('.js') && stats.size < 200 * 1024) {
            const content = fs.readFileSync(fullPath, 'utf8');
            preview = content.slice(0, 500);
          }
          files.push({ type: 'file', path: relativePath, name: entry.name, size: stats.size, preview });
        } catch { /* skip */ }
      }
    }
  } catch (e) {
    warn('self-healing-guard', `scan failed: ${e.message}`);
  }
  return files;
}

export function refreshFileMemory() {
  const files = scanDirectory(SRC_DIR);
  const memory = {
    scannedAt: new Date().toISOString(),
    totalFiles: files.filter(f => f.type === 'file').length,
    totalDirs: files.filter(f => f.type === 'dir').length,
    files
  };
  try {
    fs.mkdirSync(path.dirname(FILE_MEMORY_PATH), { recursive: true });
    fs.writeFileSync(FILE_MEMORY_PATH, JSON.stringify(memory, null, 2), { mode: 0o600 });
    info('self-healing-guard', `📁 file memory: ${memory.totalFiles} files, ${memory.totalDirs} dirs`);
  } catch (e) {
    warn('self-healing-guard', `file memory save failed: ${e.message}`);
  }
  return memory;
}

export function getFileMemory() {
  try { return JSON.parse(fs.readFileSync(FILE_MEMORY_PATH, 'utf8')); }
  catch { return { files: [], totalFiles: 0 }; }
}

// ─────────────────────────────────────────────
// قراءة الأعطال + فلاتر
// ─────────────────────────────────────────────
function loadLastScan() {
  try { return JSON.parse(fs.readFileSync(LAST_SCAN_FILE, 'utf8')); }
  catch { return { lastErrorId: 0 }; }
}
function saveLastScan(state) {
  try {
    fs.mkdirSync(path.dirname(LAST_SCAN_FILE), { recursive: true });
    fs.writeFileSync(LAST_SCAN_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
  } catch { /* silent */ }
}

function shouldSkip(failure) {
  const scope = String(failure.scope || '').toLowerCase();
  const type = String(failure.kind || '');
  if (SKIP_SCOPES.some(s => scope === s || scope.includes(`_${s}`) || scope.startsWith(`${s}_`))) return true;
  if (SKIP_TYPE_PATTERNS.some(p => p.test(type))) return true;
  return false;
}

function isRecentDuplicate(scope, errorType) {
  try {
    const cutoff = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3600_000).toISOString();
    const row = db.prepare(`
      SELECT id FROM healing_incidents
      WHERE component = ? AND error_type = ? AND created_at >= ?
      LIMIT 1
    `).get(scope, errorType, cutoff);
    return !!row;
  } catch { return false; }
}

function getNewFailures() {
  try {
    const state = loadLastScan();
    const lastId = Number(state.lastErrorId || 0);

    const rows = db.prepare(`
      SELECT id, scope, error_type, message, occurrence_count, last_seen, resolved
      FROM errors
      WHERE id > ? AND resolved = 0
        AND last_seen >= datetime('now', '-${MAX_ERROR_AGE_HOURS} hours')
      ORDER BY id ASC
      LIMIT 20
    `).all(lastId);

    if (!rows.length) return [];

    const newLastId = Math.max(...rows.map(r => r.id));
    saveLastScan({ ...state, lastErrorId: newLastId });

    const candidates = rows.map(r => ({
      scope: r.scope || 'unknown',
      kind: r.error_type || 'unknown',
      message: r.message || '',
      attempts: r.occurrence_count || 1,
      sourceErrorId: r.id,
      timestamp: r.last_seen
    }));

    // فلترة: تجاهل الاختبار + تجاهل المكرر
    const filtered = candidates.filter(f => {
      if (shouldSkip(f)) {
        info('self-healing-guard', `⏭️ تجاهل (اختباري): ${f.scope}/${f.kind}`);
        return false;
      }
      if (isRecentDuplicate(f.scope, f.kind)) {
        info('self-healing-guard', `⏭️ تجاهل (مكرر خلال ${DEDUP_WINDOW_HOURS}h): ${f.scope}/${f.kind}`);
        return false;
      }
      return true;
    });

    return filtered.slice(0, MAX_INCIDENTS_PER_RUN);
  } catch (e) {
    warn('self-healing-guard', `read new failures failed: ${e.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────
// التحليل
// ─────────────────────────────────────────────
async function analyzeFailure(failure) {
  try {
    const { callModel } = await import('./ai.js');
    const fileMemory = getFileMemory();
    const relevantFiles = fileMemory.files.filter(f => f.type === 'file').slice(0, 15).map(f => `${f.path} (${f.size}B)`);

    const prompt = `أنت مهندس تشخيص أعطال. حلّل الفشل وقدّم تشخيصاً موجزاً.

الفشل:
- النطاق: ${failure.scope}
- النوع: ${failure.kind}
- الرسالة: ${String(failure.message).slice(0, 400)}
- التكرار: ${failure.attempts}

ملفات المشروع (15 نموذج):
${relevantFiles.join('\n')}

أعد JSON فقط:
{"root_cause":"...","severity":"low|medium|high|critical","repair_action":"safe_retry|clear_cache|reload_module|notify_only","explanation":"..."}`;

    const result = await callModel('reviewer', prompt);
    const clean = String(result).replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    warn('self-healing-guard', `analysis failed: ${e.message}`);
  }
  return { root_cause: 'unknown', severity: 'medium', repair_action: 'notify_only', explanation: 'تعذر التحليل' };
}

// ─────────────────────────────────────────────
// الإصلاح
// ─────────────────────────────────────────────
async function attemptRepair(analysis) {
  const action = analysis.repair_action || 'notify_only';
  switch (action) {
    case 'safe_retry':
      return { action, success: true, detail: 'تم تسجيل إعادة المحاولة' };
    case 'clear_cache':
      try {
        const cacheDir = path.join(config.root, 'data', 'cache');
        if (fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true, force: true });
        return { action, success: true, detail: 'تم مسح الكاش' };
      } catch (e) { return { action, success: false, detail: e.message }; }
    case 'reload_module':
      return { action, success: true, detail: 'يتطلب إعادة تشغيل (يدوي)' };
    default:
      return { action: 'notify_only', success: true, detail: 'انتظر تدخّل القائد' };
  }
}

// ─────────────────────────────────────────────
// الإشعار الموحّد
// ─────────────────────────────────────────────
async function notifyUnified(failure, analysis, repair) {
  try {
    const { sendMessageDetailed } = await import('./telegram.js');
    const sevEmoji = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' }[analysis.severity] || '⚠️';
    const repairEmoji = repair.success ? '✅' : '⚠️';

    const text = [
      `${sevEmoji} <b>حارس الأعطال</b> — ${analysis.severity}`,
      '',
      `📍 <code>${failure.scope}</code> — <code>${failure.kind}</code>`,
      `📄 <i>${String(failure.message).slice(0, 180)}</i>`,
      '',
      `🧠 <b>السبب:</b> ${analysis.root_cause}`,
      `🔧 <b>الإجراء:</b> ${repair.action}`,
      `${repairEmoji} <b>النتيجة:</b> ${repair.detail}`,
      '',
      `⏰ ${new Date().toISOString().slice(11, 19)}`
    ].join('\n');

    await sendMessageDetailed(text);
  } catch (e) {
    warn('self-healing-guard', `notify failed: ${e.message}`);
  }
}

// ─────────────────────────────────────────────
// المعالج الرئيسي
// ─────────────────────────────────────────────
async function processFailure(failure) {
  info('self-healing-guard', `🔍 معالجة: ${failure.scope}/${failure.kind}`);

  const insertResult = db.prepare(`
    INSERT INTO healing_incidents(source_error_id, component, error_type, error_message, status)
    VALUES (?, ?, ?, ?, 'analyzing')
  `).run(failure.sourceErrorId || 0, failure.scope, failure.kind, String(failure.message).slice(0, 500));
  const incidentId = Number(insertResult.lastInsertRowid);

  const analysis = await analyzeFailure(failure);

  // فلتر severity
  const sevLevel = SEVERITY_ORDER[analysis.severity] || 2;
  const minLevel = SEVERITY_ORDER[MIN_SEVERITY] || 3;
  const shouldNotify = sevLevel >= minLevel;

  db.prepare(`
    UPDATE healing_incidents SET root_cause = ?, repair_action = ?, severity = ?, status = 'analyzed'
    WHERE id = ?
  `).run(analysis.root_cause, analysis.repair_action, analysis.severity, incidentId);

  if (!shouldNotify) {
    info('self-healing-guard', `⏭️ لا إشعار (severity=${analysis.severity} < ${MIN_SEVERITY})`);
    db.prepare(`UPDATE healing_incidents SET status='resolved', resolved_at=CURRENT_TIMESTAMP WHERE id = ?`).run(incidentId);
    return { incidentId, analysis, repair: null, notified: false };
  }

  const repair = await attemptRepair(analysis);
  db.prepare(`
    UPDATE healing_incidents SET repair_action = ?, status = ?, notified = 1, resolved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(`${repair.action}: ${repair.detail}`, repair.success ? 'resolved' : 'pending', incidentId);

  await notifyUnified(failure, analysis, repair);

  audit('self-healing-guard', 'incident_processed', {
    incidentId, scope: failure.scope, kind: failure.kind, severity: analysis.severity, repaired: repair.success
  });

  return { incidentId, analysis, repair, notified: true };
}

// ─────────────────────────────────────────────
// التشغيل
// ─────────────────────────────────────────────
export function startSelfHealingGuard() {
  if (!GUARD_ENABLED) return { disabled: true };

  info('self-healing-guard', '🛡️ بدء حارس الأعطال الذكي');

  refreshFileMemory();
  const fileMemoryTimer = setInterval(refreshFileMemory, 6 * 60 * 60 * 1000);
  fileMemoryTimer.unref();

  const failureTimer = setInterval(async () => {
    const failures = getNewFailures();
    if (!failures.length) return;
    info('self-healing-guard', `📥 ${failures.length} عطل جديد`);
    for (const failure of failures) {
      try { await processFailure(failure); }
      catch (e) { warn('self-healing-guard', `process failed: ${e.message}`); }
    }
  }, 5 * 60 * 1000);
  failureTimer.unref();

  info('self-healing-guard', `✅ الحارس نشط — فلاتر: skip=${SKIP_SCOPES.length} scopes, min=${MIN_SEVERITY}, dedup=${DEDUP_WINDOW_HOURS}h, max=${MAX_INCIDENTS_PER_RUN}/run`);
  return { started: true };
}

export function getGuardStats() {
  try {
    const total = db.prepare('SELECT COUNT(*) c FROM healing_incidents').get().c;
    const resolved = db.prepare("SELECT COUNT(*) c FROM healing_incidents WHERE status='resolved'").get().c;
    const notified = db.prepare("SELECT COUNT(*) c FROM healing_incidents WHERE notified=1").get().c;
    const recent = db.prepare(`SELECT component, error_type, severity, status, created_at FROM healing_incidents ORDER BY id DESC LIMIT 10`).all();
    return { total, resolved, pending: total - resolved, notified, recent };
  } catch (e) { return { error: e.message }; }
}

export default { startSelfHealingGuard, refreshFileMemory, getFileMemory, getGuardStats };

if (GUARD_ENABLED) startSelfHealingGuard();

info('self-healing-guard', `🛡️ module loaded (enabled: ${GUARD_ENABLED})`);
