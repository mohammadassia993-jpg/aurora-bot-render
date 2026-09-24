// tool-executor.js (ESM)
// طبقة تنفيذ الأدوات الحقيقية لنظام "عمالقة الصمت"

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT_ID = process.env.CHAT_ID;
const GITHUB_OWNER_REPO = process.env.GITHUB_REPO || 'mohammadassia993-jpg/aurora-bot-render';

const SAFE_ROOT = process.env.PROJECT_ROOT || process.cwd();
const SHELL_ALLOWLIST = ['npm', 'npx', 'git', 'node'];
const TOOL_TIMEOUT_MS = 20000;
const SEARCH_TIMEOUT_MS = 15000;

const SKIP_DIRS = new Set(['node_modules', '.git', 'data', 'logs', 'dist', '.cache', 'uploads']);

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout ' + ms + 'ms: ' + label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function resolveSafePath(relativePath) {
  const resolved = path.resolve(SAFE_ROOT, relativePath);
  if (!resolved.startsWith(SAFE_ROOT)) {
    throw new Error('path out of SAFE_ROOT');
  }
  return resolved;
}

function* walkFiles(dir, maxDepth = 5, currentDepth = 0) {
  if (currentDepth > maxDepth) return;
  let entries;
  try {
    entries = fsSync.readdirSync(dir, { withFileTypes: true });
  } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full, maxDepth, currentDepth + 1);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

// ─────────────────────────────────────────────
// تنظيف روابط DuckDuckGo
// ─────────────────────────────────────────────
function cleanDdgUrl(url) {
  if (!url) return '';
  try {
    let u = String(url);
    // إزالة // في البداية
    if (u.startsWith('//')) u = 'https:' + u;
    // استخراج uddg parameter
    const uddgMatch = u.match(/[?&]uddg=([^&]+)/);
    if (uddgMatch) {
      return decodeURIComponent(uddgMatch[1]);
    }
    return u;
  } catch {
    return String(url);
  }
}

// ─────────────────────────────────────────────
// 1) github_api
// ─────────────────────────────────────────────
async function githubApi({ endpoint, method = 'GET', body = null }) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN missing');
  const url = endpoint.startsWith('http')
    ? endpoint
    : 'https://api.github.com/repos/' + GITHUB_OWNER_REPO + (endpoint.startsWith('/') ? '' : '/') + endpoint;

  const res = await withTimeout(
    fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + GITHUB_TOKEN,
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

  if (!res.ok) throw new Error('GitHub API ' + res.status + ': ' + JSON.stringify(data).slice(0, 500));
  return { status: res.status, data };
}

// ─────────────────────────────────────────────
// 2) send_telegram
// ─────────────────────────────────────────────
async function sendTelegram({ chat_id, text }) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const targetChatId = chat_id || DEFAULT_CHAT_ID;
  if (!targetChatId) throw new Error('no chat_id');

  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
  const res = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: String(text).slice(0, 4096),
        parse_mode: 'HTML',
      }),
    }),
    TOOL_TIMEOUT_MS,
    'send_telegram'
  );

  const data = await res.json();
  if (!data.ok) throw new Error('Telegram API: ' + JSON.stringify(data));
  return { message_id: data.result.message_id, sent: true };
}

// ─────────────────────────────────────────────
// 3) shell_exec
// ─────────────────────────────────────────────
function shellExec({ command, args = [] }) {
  const bin = String(command).trim();
  if (!SHELL_ALLOWLIST.includes(bin)) {
    throw new Error('command not allowed: ' + bin);
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
// 4) http_fetch
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
// 5) read_file
// ─────────────────────────────────────────────
async function readFile({ file_path }) {
  const full = resolveSafePath(file_path);
  const content = await fs.readFile(full, 'utf-8');
  return { content: content.slice(0, 8000), truncated: content.length > 8000 };
}

// ─────────────────────────────────────────────
// 6) write_file
// ─────────────────────────────────────────────
async function writeFile({ file_path, content }) {
  const full = resolveSafePath(file_path);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf-8');
  return { written: true, path: file_path, bytes: Buffer.byteLength(content) };
}

// ─────────────────────────────────────────────
// 7) grep_files
// ─────────────────────────────────────────────
async function grepFiles({ pattern, file_ext = '.js', max_results = 30 }) {
  if (!pattern || String(pattern).length < 2) {
    throw new Error('pattern must be 2+ chars');
  }

  const needle = String(pattern).toLowerCase();
  const results = [];
  let scanned = 0;

  for (const fullPath of walkFiles(SAFE_ROOT)) {
    if (!fullPath.endsWith(file_ext)) continue;
    scanned++;
    try {
      const stats = fsSync.statSync(fullPath);
      if (stats.size > 500 * 1024) continue;
      const content = fsSync.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(needle)) {
          results.push({
            file: path.relative(SAFE_ROOT, fullPath),
            line: i + 1,
            text: lines[i].trim().slice(0, 200)
          });
          if (results.length >= max_results) break;
        }
      }
      if (results.length >= max_results) break;
    } catch { /* skip */ }
  }

  return { pattern, file_ext, scanned_files: scanned, results_count: results.length, results };
}

// ─────────────────────────────────────────────
// 8) read_many_files
// ─────────────────────────────────────────────
async function readManyFiles({ files }) {
  if (!Array.isArray(files) || !files.length) throw new Error('files must be array');
  if (files.length > 5) throw new Error('max 5 files');

  const results = [];
  for (const fp of files) {
    try {
      const full = resolveSafePath(fp);
      const stats = await fs.stat(full);
      if (stats.size > 200 * 1024) {
        results.push({ file: fp, error: 'file too large (>200KB)' });
        continue;
      }
      const content = await fs.readFile(full, 'utf-8');
      results.push({
        file: fp,
        size: stats.size,
        content: content.slice(0, 6000),
        truncated: content.length > 6000
      });
    } catch (e) {
      results.push({ file: fp, error: e.message });
    }
  }
  return { count: results.length, files: results };
}

// ─────────────────────────────────────────────
// 9) list_files
// ─────────────────────────────────────────────
async function listFiles({ dir = '.', max_depth = 2 }) {
  const full = resolveSafePath(dir);
  const items = [];

  function scan(currentDir, depth) {
    if (depth > max_depth) return;
    try {
      const entries = fsSync.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
        if (SKIP_DIRS.has(entry.name)) continue;
        const fullPath = path.join(currentDir, entry.name);
        const rel = path.relative(SAFE_ROOT, fullPath);
        if (entry.isDirectory()) {
          items.push({ type: 'dir', path: rel });
          scan(fullPath, depth + 1);
        } else {
          const stats = fsSync.statSync(fullPath);
          items.push({ type: 'file', path: rel, size: stats.size });
        }
        if (items.length > 500) return;
      }
    } catch { /* skip */ }
  }

  scan(full, 0);
  return { dir, count: items.length, items: items.slice(0, 200) };
}

// ─────────────────────────────────────────────
// 10) web_search — DuckDuckGo
// ─────────────────────────────────────────────
async function webSearch({ query, max_results = 5 }) {
  if (!query || String(query).length < 2) throw new Error('query required');

  const q = String(query).trim();

  // 1) Instant Answer API
  try {
    const iaUrl = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&no_html=1&skip_disambig=1&t=silent-giants';
    const res = await withTimeout(fetch(iaUrl, { headers: { 'User-Agent': 'SilentGiants/1.0' } }), SEARCH_TIMEOUT_MS, 'ddg_ia');
    if (res.ok) {
      const data = await res.json();
      const results = [];

      if (data.AbstractText) {
        results.push({
          title: data.Heading || q,
          snippet: String(data.AbstractText).slice(0, 400),
          url: cleanDdgUrl(data.AbstractURL || ''),
          source: data.AbstractSource || 'DuckDuckGo'
        });
      }

      const topics = (data.RelatedTopics || []).slice(0, max_results);
      for (const topic of topics) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: String(topic.Text).split(' - ')[0].slice(0, 120),
            snippet: String(topic.Text).slice(0, 300),
            url: cleanDdgUrl(topic.FirstURL),
            source: 'DuckDuckGo'
          });
        } else if (topic.Topics) {
          for (const sub of topic.Topics.slice(0, 2)) {
            if (sub.Text && sub.FirstURL) {
              results.push({
                title: String(sub.Text).split(' - ')[0].slice(0, 120),
                snippet: String(sub.Text).slice(0, 300),
                url: cleanDdgUrl(sub.FirstURL),
                source: 'DuckDuckGo'
              });
            }
          }
        }
      }

      if (results.length > 0) {
        return { query: q, count: results.length, results: results.slice(0, max_results), engine: 'ddg_instant' };
      }
    }
  } catch (e) {
    console.warn('[web_search] DDG Instant failed: ' + e.message);
  }

  // 2) HTML fallback
  try {
    const htmlUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
    const res = await withTimeout(fetch(htmlUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SilentGiants/1.0)' }
    }), SEARCH_TIMEOUT_MS, 'ddg_html');
    if (res.ok) {
      const html = await res.text();
      const results = [];
      const regex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let match;
      while ((match = regex.exec(html)) !== null && results.length < max_results) {
        const url = cleanDdgUrl(match[1]);
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        const snippet = match[3].replace(/<[^>]*>/g, '').trim().slice(0, 300);
        if (title && url) {
          results.push({ title, snippet, url, source: 'DuckDuckGo HTML' });
        }
      }
      if (results.length > 0) {
        return { query: q, count: results.length, results, engine: 'ddg_html' };
      }
    }
  } catch (e) {
    console.warn('[web_search] DDG HTML failed: ' + e.message);
  }

  return { query: q, count: 0, results: [], error: 'no_results' };
}

// ─────────────────────────────────────────────
const TOOL_MAP = {
  github_api: githubApi,
  send_telegram: sendTelegram,
  shell_exec: shellExec,
  http_fetch: httpFetch,
  read_file: readFile,
  write_file: writeFile,
  grep_files: grepFiles,
  read_many_files: readManyFiles,
  list_files: listFiles,
  web_search: webSearch,
};

export const AVAILABLE_TOOLS = [
  { name: 'web_search', description: 'البحث في الإنترنت عبر DuckDuckGo.', params: { query: 'string', max_results: 'number (افتراضي 5)' } },
  { name: 'grep_files', description: 'البحث عن نص في جميع ملفات المشروع.', params: { pattern: 'string', file_ext: 'string (افتراضي .js)', max_results: 'number' } },
  { name: 'read_many_files', description: 'قراءة حتى 5 ملفات في نداء واحد.', params: { files: 'string[] (حد أقصى 5)' } },
  { name: 'list_files', description: 'سرد محتويات مجلد.', params: { dir: 'string (افتراضي ".")', max_depth: 'number (افتراضي 2)' } },
  { name: 'read_file', description: 'قراءة ملف واحد.', params: { file_path: 'string (نسبي)' } },
  { name: 'write_file', description: 'كتابة/تعديل ملف.', params: { file_path: 'string', content: 'string' } },
  { name: 'github_api', description: 'استدعاء GitHub REST API.', params: { endpoint: 'string', method: 'GET|POST', body: 'object|null' } },
  { name: 'send_telegram', description: 'إرسال رسالة Telegram.', params: { chat_id: 'string (اختياري)', text: 'string' } },
  { name: 'shell_exec', description: 'تنفيذ shell. مسموح: ' + SHELL_ALLOWLIST.join(', '), params: { command: 'string', args: 'string[]' } },
  { name: 'http_fetch', description: 'طلب HTTP عام.', params: { url: 'string', method: 'string', headers: 'object', body: 'object|null' } },
];

export async function executeTool(toolName, params = {}) {
  const fn = TOOL_MAP[toolName];
  if (!fn) {
    return { ok: false, tool: toolName, error: 'unknown tool. Available: ' + Object.keys(TOOL_MAP).join(', ') };
  }
  try {
    const result = await fn(params);
    return { ok: true, tool: toolName, result };
  } catch (err) {
    return { ok: false, tool: toolName, error: err.message || String(err) };
  }
}
