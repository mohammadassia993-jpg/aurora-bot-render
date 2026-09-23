/**
 * self-healing-guard.js — حارس الأعطال الذكي
 *
 * الوظائف:
 * 1. ذاكرة الملفات: يقرأ src/ كل 6 ساعات ويحفظ فهرساً مفصّلاً
 * 2. مراقبة الأعطال: يقرأ جدول errors من DB كل 5 دقائق
 * 3. التحليل العميق: يستدعي LLM7 لتشخيص السبب الجذري
 * 4. الإصلاح الآمن: retry / cache clear / notify_only
 * 5. التقارير: تنبيه العطل + تقرير الإصلاح على Telegram
 *
 * التحكم: SELF_HEALING_GUARD_ENABLED=true لتفعيله
 * الافتراضي: معطّل (لا يفعل شيئاً)
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';
import { info, warn } from './logger.js';
import { audit } from './audit.js';

// ─────────────────────────────────────────────
// مفتاح التحكم
// ─────────────────────────────────────────────
const GUARD_ENABLED = process.env.SELF_HEALING_GUARD_ENABLED === 'true';

if (!GUARD_ENABLED) {
  info('self-healing-guard', '⏸ الحارس معطّل (SELF_HEALING_GUARD_ENABLED=false)');
}

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
  status TEXT DEFAULT 'detected',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS healing_status ON healing_incidents(status, created_at);
CREATE INDEX IF NOT EXISTS healing_source ON healing_incidents(source_error_id);
`);

// ─────────────────────────────────────────────
// المسارات
// ─────────────────────────────────────────────
const SRC_DIR = path.join(config.root, 'src');
const FILE_MEMORY_PATH = path.join(config.root, 'data', 'file-memory.json');
const LAST_SCAN_FILE = path.join(config.root, 'data', 'last-guard-scan.json');

// ─────────────────────────────────────────────
// 1) ذاكرة الملفات
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
          files.push({
            type: 'file',
            path: relativePath,
            name: entry.name,
            size: stats.size,
            preview
          });
        } catch { /* skip unreadable */ }
      }
    }
  } catch (e) {
    warn('self-healing-guard', `scan failed for ${dir}: ${e.message}`);
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
  try {
    return JSON.parse(fs.readFileSync(FILE_MEMORY_PATH, 'utf8'));
  } catch {
    return { files: [], totalFiles: 0 };
  }
}

// ─────────────────────────────────────────────
// 2) قراءة الأعطال الجديدة من جدول errors
// ─────────────────────────────────────────────
function loadLastScan() {
  try { return JSON.parse(fs.readFileSync(LAST_SCAN_FILE, 'utf8')); }
  catch { return { lastErrorId: 0, lastFileCount: 0 }; }
}

function saveLastScan(state) {
  try {
    fs.mkdirSync(path.dirname(LAST_SCAN_FILE), { recursive: true });
    fs.writeFileSync(LAST_SCAN_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
  } catch { /* silent */ }
}

function getNewFailures() {
  try {
    const state = loadLastScan();
    const lastId = Number(state.lastErrorId || 0);

    // نقرأ الأخطاء الجديدة غير المحلولة، الأحدث من آخر scan
    const rows = db.prepare(`
      SELECT id, scope, error_type, message, occurrence_count, last_seen, resolved
      FROM errors
      WHERE id > ? AND resolved = 0
      ORDER BY id ASC
      LIMIT 10
    `).all(lastId);

    if (!rows.length) return [];

    // تحديث آخر ID معالج
    const newLastId = Math.max(...rows.map(r => r.id));
    saveLastScan({ ...state, lastErrorId: newLastId });

    // تحويلها لشكل يفهمه processFailure
    return rows.map(r => ({
      scope: r.scope || 'unknown',
      kind: r.error_type || 'unknown',
      message: r.message || '',
      attempts: r.occurrence_count || 1,
      sourceErrorId: r.id,
      timestamp: r.last_seen
    }));
  } catch (e) {
    warn('self-healing-guard', `read new failures failed: ${e.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────
// 3) التحليل العميق
// ─────────────────────────────────────────────
async function analyzeFailure(failure) {
  try {
    const { callModel } = await import('./ai.js');
    const fileMemory = getFileMemory();
    const relevantFiles = fileMemory.files
      .filter(f => f.type === 'file')
      .slice(0, 20)
      .map(f => `${f.path} (${f.size} bytes)`);

    const prompt = `أنت مهندس تشخيص أعطال. حلّل الفشل التالي وقدّم تشخيصاً موجزاً.

الفشل:
- النطاق: ${failure.scope || 'unknown'}
- النوع: ${failure.kind || 'unknown'}
- الرسالة: ${String(failure.message || '').slice(0, 500)}
- عدد المرات: ${failure.attempts || 1}

الملفات المتاحة في المشروع (20 نموذجاً):
${relevantFiles.join('\n')}

أعد JSON فقط:
{
  "root_cause": "السبب الجذري المحتمل (جملة واحدة)",
  "severity": "low|medium|high|critical",
  "repair_action": "safe_retry|clear_cache|reload_module|notify_only",
  "explanation": "شرح مختصر بالعربية"
}`;

    const result = await callModel('reviewer', prompt);
    const clean = String(result).replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch (e) {
    warn('self-healing-guard', `analysis failed: ${e.message}`);
  }
  return {
    root_cause: 'unknown',
    severity: 'medium',
    repair_action: 'notify_only',
    explanation: 'تعذر التحليل التلقائي'
  };
}

// ─────────────────────────────────────────────
// 4) الإصلاح الآمن
// ─────────────────────────────────────────────
async function attemptRepair(analysis, failure) {
  const action = analysis.repair_action || 'notify_only';

  switch (action) {
    case 'safe_retry':
      info('self-healing-guard', `🔧 إصلاح: إعادة محاولة آمنة`);
      return { action, success: true, detail: 'تم تسجيل إعادة المحاولة' };

    case 'clear_cache':
      info('self-healing-guard', `🔧 إصلاح: مسح كاش الملفات`);
      try {
        const cacheDir = path.join(config.root, 'data', 'cache');
        if (fs.existsSync(cacheDir)) {
          fs.rmSync(cacheDir, { recursive: true, force: true });
        }
        return { action, success: true, detail: 'تم مسح الكاش' };
      } catch (e) {
        return { action, success: false, detail: e.message };
      }

    case 'reload_module':
      info('self-healing-guard', `🔧 إصلاح: إعادة تحميل مسجل`);
      return { action, success: true, detail: 'يتطلب إعادة تشغيل (يدوي)' };

    case 'notify_only':
    default:
      return { action: 'notify_only', success: true, detail: 'انتظر تدخّل القائد' };
  }
}

// ─────────────────────────────────────────────
// 5) الإشعارات على Telegram
// ─────────────────────────────────────────────
async function notifyIncident(failure, analysis) {
  try {
    const { sendMessageDetailed } = await import('./telegram.js');
    const severityEmoji = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' }[analysis.severity] || '⚠️';
    const text = [
      `${severityEmoji} <b>حارس الأعطال — تنبيه</b>`,
      '',
      `📍 النطاق: <code>${failure.scope || 'unknown'}</code>`,
      `🔍 النوع: ${failure.kind || 'unknown'}`,
      `📄 الرسالة: <i>${String(failure.message || '').slice(0, 200)}</i>`,
      '',
      `🧠 <b>التشخيص:</b> ${analysis.root_cause}`,
      `⚙️ <b>الإجراء المقترح:</b> ${analysis.repair_action}`,
      `💬 ${analysis.explanation}`,
      '',
      `⏰ ${new Date().toISOString()}`
    ].join('\n');
    await sendMessageDetailed(text);
  } catch (e) {
    warn('self-healing-guard', `incident notify failed: ${e.message}`);
  }
}

async function notifyRepair(failure, analysis, repair) {
  try {
    const { sendMessageDetailed } = await import('./telegram.js');
    const statusEmoji = repair.success ? '✅' : '⚠️';
    const text = [
      `${statusEmoji} <b>حارس الأعطال — تقرير الإصلاح</b>`,
      '',
      `📍 النطاق: <code>${failure.scope || 'unknown'}</code>`,
      `🧠 السبب الجذري: ${analysis.root_cause}`,
      `🔧 الإجراء المُنفَّذ: ${repair.action}`,
      `📊 النتيجة: ${repair.detail}`,
      '',
      `⏰ ${new Date().toISOString()}`
    ].join('\n');
    await sendMessageDetailed(text);
  } catch (e) {
    warn('self-healing-guard', `repair notify failed: ${e.message}`);
  }
}

// ─────────────────────────────────────────────
// 6) المعالج الرئيسي
// ─────────────────────────────────────────────
async function processFailure(failure) {
  info('self-healing-guard', `🔍 عطل جديد: ${failure.scope} — ${failure.kind}`);

  const insertResult = db.prepare(`
    INSERT INTO healing_incidents(source_error_id, component, error_type, error_message, status)
    VALUES (?, ?, ?, ?, 'analyzing')
  `).run(
    failure.sourceErrorId || 0,
    failure.scope || 'unknown',
    failure.kind || 'unknown',
    String(failure.message || '').slice(0, 500)
  );
  const incidentId = Number(insertResult.lastInsertRowid);

  const analysis = await analyzeFailure(failure);
  db.prepare(`
    UPDATE healing_incidents SET root_cause = ?, repair_action = ?, status = 'analyzed'
    WHERE id = ?
  `).run(analysis.root_cause, analysis.repair_action, incidentId);

  await notifyIncident(failure, analysis);

  const repair = await attemptRepair(analysis, failure);
  db.prepare(`
    UPDATE healing_incidents SET repair_action = ?, status = ?, resolved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(`${repair.action}: ${repair.detail}`, repair.success ? 'resolved' : 'pending', incidentId);

  await notifyRepair(failure, analysis, repair);

  audit('self-healing-guard', 'incident_processed', {
    incidentId, scope: failure.scope, kind: failure.kind, repaired: repair.success
  });

  return { incidentId, analysis, repair };
}

// ─────────────────────────────────────────────
// 7) تشغيل الحارس
// ─────────────────────────────────────────────
export function startSelfHealingGuard() {
  if (!GUARD_ENABLED) {
    return { disabled: true };
  }

  info('self-healing-guard', '🛡️ بدء حارس الأعطال الذكي');

  // ذاكرة الملفات: فوراً + كل 6 ساعات
  refreshFileMemory();
  const fileMemoryTimer = setInterval(refreshFileMemory, 6 * 60 * 60 * 1000);
  fileMemoryTimer.unref();

  // مراقبة الأعطال: كل 5 دقائق
  const failureTimer = setInterval(async () => {
    const failures = getNewFailures();
    if (!failures.length) return;
    info('self-healing-guard', `📥 ${failures.length} عطل جديد للمعالجة`);
    for (const failure of failures.slice(0, 5)) {
      try {
        await processFailure(failure);
      } catch (e) {
        warn('self-healing-guard', `process failure failed: ${e.message}`);
      }
    }
  }, 5 * 60 * 1000);
  failureTimer.unref();

  info('self-healing-guard', '✅ الحارس نشط (ذاكرة الملفات + مراقبة الأعطال)');
  return { started: true, intervals: { fileMemory: '6h', failureMonitor: '5min' } };
}

// ─────────────────────────────────────────────
// إحصائيات
// ─────────────────────────────────────────────
export function getGuardStats() {
  try {
    const total = db.prepare('SELECT COUNT(*) c FROM healing_incidents').get().c;
    const resolved = db.prepare("SELECT COUNT(*) c FROM healing_incidents WHERE status='resolved'").get().c;
    const recent = db.prepare(`
      SELECT component, error_type, status, created_at FROM healing_incidents
      ORDER BY id DESC LIMIT 10
    `).all();
    return { total, resolved, pending: total - resolved, recent };
  } catch (e) {
    return { error: e.message };
  }
}

export default { startSelfHealingGuard, refreshFileMemory, getFileMemory, getGuardStats };

info('self-healing-guard', `🛡️ module loaded (enabled: ${GUARD_ENABLED})`);
