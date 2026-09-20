// tool-executor.js (ESM)
// طبقة تنفيذ الأدوات الحقيقية لنظام "عمالقة الصمت" (Silent Giants)
// كل دالة هنا تُنفّذ فعلياً (API حقيقي / أمر shell حقيقي) ولا تكتفي بالنص.

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// ─────────────────────────────────────────────
// إعدادات عامة
// ─────────────────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT_ID = process.env.CHAT_ID;
const GITHUB_OWNER_REPO = process.env.GITHUB_REPO || 'mohammadassia993-jpg/aurora-bot-render';

// جذر آمن لعمليات الملفات — يمنع الوكيل من الخروج خارج مجلد المشروع
const SAFE_ROOT = process.env.PROJECT_ROOT || process.cwd();

// أوامر shell المسموحة فقط (قائمة بيضاء) — أمان أساسي حتى لو "هلوس" الـ LLM
const SHELL_ALLOWLIST = ['npm', 'npx', 'git', 'node'];

const TOOL_TIMEOUT_MS = 20000; // 20 ثانية لكل أداة، لتفادي تعليق المهمة على Render

// ─────────────────────────────────────────────
// أدوات مساعدة
// ─────────────────────────────────────────────

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`⏱️ انتهت المهلة (${ms}ms) في: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function resolveSafePath(relativePath) {
  const resolved = path.resolve(SAFE_ROOT, relativePath);
  if (!resolved.startsWith(SAFE_ROOT)) {
    throw new Error('🚫 مسار خارج النطاق المسموح (SAFE_ROOT)');
  }
  return resolved;
}

// ─────────────────────────────────────────────
// 1) github_api
// ─────────────────────────────────────────────
async function githubApi({ endpoint, method = 'GET', body = null }) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN غير موجود في Environment');
  const url = endpoint.startsWith('http')
    ? endpoint
    : `https://api.github.com/repos/${GITHUB_OWNER_REPO}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const res = await withTimeout(
    fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    TOOL_TIMEOUT_MS,
    'github_api'
  );

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    throw new Error(`GitHub API خطأ ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return { status: res.status, data };
}

// ─────────────────────────────────────────────
// 2) send_telegram
// ─────────────────────────────────────────────
async function sendTelegram({ chat_id, text }) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN غير موجود في Environment');
  const targetChatId = chat_id || DEFAULT_CHAT_ID;
  if (!targetChatId) throw new Error('لا يوجد chat_id (لا في params ولا في CHAT_ID)');

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: String(text).slice(0, 4096), // حد تيليغرام لطول الرسالة
        parse_mode: 'HTML',
      }),
    }),
    TOOL_TIMEOUT_MS,
    'send_telegram'
  );

  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API خطأ: ${JSON.stringify(data)}`);
  return { message_id: data.result.message_id, sent: true };
}

// ─────────────────────────────────────────────
// 3) shell_exec — مقيّد بقائمة بيضاء
// ─────────────────────────────────────────────
function shellExec({ command, args = [] }) {
  const bin = String(command).trim();
  if (!SHELL_ALLOWLIST.includes(bin)) {
    throw new Error(`🚫 الأمر "${bin}" غير مسموح. المسموح فقط: ${SHELL_ALLOWLIST.join(', ')}`);
  }
  return withTimeout(
    new Promise((resolve, reject) => {
      execFile(bin, args, { cwd: SAFE_ROOT, timeout: TOOL_TIMEOUT_MS }, (err, stdout, stderr) => {
        if (err && !stdout) return reject(new Error(stderr || err.message));
        resolve({ stdout: stdout.slice(0, 4000), stderr: stderr.slice(0, 2000) });
      });
    }),
    TOOL_TIMEOUT_MS,
    'shell_exec'
  );
}

// ─────────────────────────────────────────────
// 4) http_fetch — أي طلب HTTP عام
// ─────────────────────────────────────────────
async function httpFetch({ url, method = 'GET', headers = {}, body = null }) {
  const res = await withTimeout(
    fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }),
    TOOL_TIMEOUT_MS,
    'http_fetch'
  );
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 3000); }
  return { status: res.status, ok: res.ok, data };
}

// ─────────────────────────────────────────────
// 5) read_file / write_file — مقيّدة بـ SAFE_ROOT
// ─────────────────────────────────────────────
async function readFile({ file_path }) {
  const full = resolveSafePath(file_path);
  const content = await fs.readFile(full, 'utf-8');
  return { content: content.slice(0, 8000), truncated: content.length > 8000 };
}

async function writeFile({ file_path, content }) {
  const full = resolveSafePath(file_path);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf-8');
  return { written: true, path: file_path, bytes: Buffer.byteLength(content) };
}

// ─────────────────────────────────────────────
// الموزّع الرئيسي (Dispatcher)
// ─────────────────────────────────────────────
const TOOL_MAP = {
  github_api: githubApi,
  send_telegram: sendTelegram,
  shell_exec: shellExec,
  http_fetch: httpFetch,
  read_file: readFile,
  write_file: writeFile,
};

// وصف الأدوات — يُستخدم في System Prompt (ai.js) حتى يعرف الـ LLM ما هو متاح بالضبط
export const AVAILABLE_TOOLS = [
  {
    name: 'github_api',
    description: 'استدعاء GitHub REST API على مستودع المشروع (أو أي endpoint كامل)',
    params: { endpoint: 'string (e.g. "/actions/runs" أو رابط كامل)', method: 'GET|POST|PUT|PATCH|DELETE', body: 'object|null' },
  },
  {
    name: 'send_telegram',
    description: 'إرسال رسالة فعلية على Telegram',
    params: { chat_id: 'string|number (اختياري، الافتراضي CHAT_ID)', text: 'string' },
  },
  {
    name: 'shell_exec',
    description: `تنفيذ أمر shell مسموح فقط ضمن: ${SHELL_ALLOWLIST.join(', ')}`,
    params: { command: 'string (واحد من القائمة المسموحة)', args: 'string[]' },
  },
  {
    name: 'http_fetch',
    description: 'طلب HTTP عام لأي رابط',
    params: { url: 'string', method: 'string', headers: 'object', body: 'object|null' },
  },
  {
    name: 'read_file',
    description: 'قراءة ملف داخل مجلد المشروع فقط',
    params: { file_path: 'string (نسبي لمجلد المشروع)' },
  },
  {
    name: 'write_file',
    description: 'كتابة/تعديل ملف داخل مجلد المشروع فقط',
    params: { file_path: 'string', content: 'string' },
  },
];

/**
 * ينفّذ أداة بالاسم مع معاملاتها، ويعيد نتيجة موحّدة (لا يرمي استثناءات للخارج).
 * @param {string} toolName
 * @param {object} params
 * @returns {Promise<{ok: boolean, tool: string, result?: any, error?: string}>}
 */
export async function executeTool(toolName, params = {}) {
  const fn = TOOL_MAP[toolName];
  if (!fn) {
    return {
      ok: false,
      tool: toolName,
      error: `أداة غير معروفة: "${toolName}". المتاح: ${Object.keys(TOOL_MAP).join(', ')}`,
    };
  }
  try {
    const result = await fn(params);
    return { ok: true, tool: toolName, result };
  } catch (err) {
    return { ok: false, tool: toolName, error: err.message || String(err) };
  }
}
