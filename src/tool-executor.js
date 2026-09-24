// tool-executor.js (ESM) — 16 أداة
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT_ID = process.env.CHAT_ID;
const GITHUB_OWNER_REPO = process.env.GITHUB_REPO || 'mohammadassia993-jpg/aurora-bot-render';
const RENDER_API_KEY = process.env.RENDER_API_KEY;
const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID || 'srv-da5a4njtqb8s739sk8g0';

const SAFE_ROOT = process.env.PROJECT_ROOT || process.cwd();
const SHELL_ALLOWLIST = ['npm', 'npx', 'git', 'node'];
const TOOL_TIMEOUT_MS = 20000;
const SEARCH_TIMEOUT_MS = 15000;
const SESSIONS_DIR = path.join(SAFE_ROOT, 'data', 'sessions');
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
  if (!resolved.startsWith(SAFE_ROOT)) throw new Error('path out of SAFE_ROOT');
  return resolved;
}

function* walkFiles(dir, maxDepth = 5, currentDepth = 0) {
  if (currentDepth > maxDepth) return;
  let entries;
  try { entries = fsSync.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full, maxDepth, currentDepth + 1);
    else if (entry.isFile()) yield full;
  }
}

function cleanDdgUrl(url) {
  if (!url) return '';
  try {
    let u = String(url);
    if (u.startsWith('//')) u = 'https:' + u;
    const m = u.match(/[?&]uddg=([^&]+)/);
    if (m) return decodeURIComponent(m[1]);
    return u;
  } catch { return String(url); }
}

function ensureSessionsDir() { try { fsSync.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch {} }

async function githubApi({ endpoint, method = 'GET', body = null }) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN missing');
  const url = endpoint.startsWith('http') ? endpoint
    : 'https://api.github.com/repos/' + GITHUB_OWNER_REPO + (endpoint.startsWith('/') ? '' : '/') + endpoint;
  const res = await withTimeout(fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: body ? JSON.stringify(body) : undefined,
  }), TOOL_TIMEOUT_MS, 'github_api');
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error('GitHub ' + res.status + ': ' + JSON.stringify(data).slice(0, 300));
  return { status: res.status, data };
}

// ═══════════════════════════════════════════════════════════
// 🆕 github_edit_file — تعديل ملف على GitHub بسطر واحد
// ═══════════════════════════════════════════════════════════
async function githubEditFile({ path: filePath, search, replace, message }) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN missing');
  if (!filePath || !search || replace === undefined || !message) {
    throw new Error('path, search, replace, message required');
  }
  const apiUrl = 'https://api.github.com/repos/' + GITHUB_OWNER_REPO + '/contents/' + filePath;

  const getRes = await withTimeout(fetch(apiUrl, {
    headers: { Authorization: 'Bearer ' + GITHUB_TOKEN, Accept: 'application/vnd.github+json' }
  }), TOOL_TIMEOUT_MS, 'github_get');
  if (!getRes.ok) throw new Error('GET ' + getRes.status);
  const fileData = await getRes.json();
  if (!fileData.content || !fileData.sha) throw new Error('no content/sha in response');

  const original = Buffer.from(fileData.content, 'base64').toString('utf8');
  if (!original.includes(search)) throw new Error('search string NOT found in file');
  const count = (original.match(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  const updated = original.split(search).join(replace);
  const newBase64 = Buffer.from(updated, 'utf8').toString('base64');

  const putRes = await withTimeout(fetch(apiUrl, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: newBase64, sha: fileData.sha, branch: 'main' })
  }), TOOL_TIMEOUT_MS, 'github_put');
  const putData = await putRes.json();
  if (!putRes.ok) throw new Error('PUT ' + putRes.status + ': ' + JSON.stringify(putData).slice(0, 300));

  return {
    edited: true,
    path: filePath,
    replacements: count,
    commitSha: putData.commit?.sha || '',
    commitUrl: putData.commit?.html_url || ''
  };
}

async function sendTelegram({ chat_id, text }) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN missing');
  const target = chat_id || DEFAULT_CHAT_ID;
  if (!target) throw new Error('no chat_id');
  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
  const res = await withTimeout(fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: target, text: String(text).slice(0, 4096), parse_mode: 'HTML' }),
  }), TOOL_TIMEOUT_MS, 'send_telegram');
  const data = await res.json();
  if (!data.ok) throw new Error('Telegram: ' + JSON.stringify(data));
  return { message_id: data.result.message_id, sent: true };
}

function shellExec({ command, args = [] }) {
  const bin = String(command).trim();
  if (!SHELL_ALLOWLIST.includes(bin)) throw new Error('command not allowed: ' + bin);
  return withTimeout(new Promise((resolve, reject) => {
    execFile(bin, args, { cwd: SAFE_ROOT, timeout: TOOL_TIMEOUT_MS }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(new Error(stderr || err.message));
      resolve({ stdout: stdout.slice(0, 4000), stderr: stderr.slice(0, 2000) });
    });
  }), TOOL_TIMEOUT_MS, 'shell_exec');
}

async function httpFetch({ url, method = 'GET', headers = {}, body = null }) {
  const res = await withTimeout(fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }), TOOL_TIMEOUT_MS, 'http_fetch');
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 3000); }
  return { status: res.status, ok: res.ok, data };
}

async function readFile({ file_path, start_line = null, end_line = null }) {
  const candidates = [file_path, 'src/' + file_path, 'public/' + file_path];
  let fullPath = null;
  for (const c of candidates) {
    try { const full = resolveSafePath(c); await fs.access(full); fullPath = full; break; } catch {}
  }
  if (!fullPath) throw new Error('file not found: ' + file_path);

  const content = await fs.readFile(fullPath, 'utf-8');
  const lines = content.split('\n');
  const total = lines.length;

  if (start_line !== null || end_line !== null) {
    const s = Math.max(1, Number(start_line) || 1);
    const e = Math.min(total, Number(end_line) || total);
    const slice = lines.slice(s - 1, e).join('\n');
    return { path: path.relative(SAFE_ROOT, fullPath), total_lines: total, range: s + '-' + e, content: slice.slice(0, 12000), truncated: slice.length > 12000 };
  }
  return { path: path.relative(SAFE_ROOT, fullPath), total_lines: total, content: content.slice(0, 8000), truncated: content.length > 8000 };
}

async function writeFile({ file_path, content }) {
  const full = resolveSafePath(file_path);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf-8');
  return { written: true, path: file_path, bytes: Buffer.byteLength(content) };
}

async function grepFiles({ pattern, file_ext = '.js', max_results = 30, context_lines = 0 }) {
  if (!pattern || String(pattern).length < 2) throw new Error('pattern must be 2+ chars');
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
          const item = { file: path.relative(SAFE_ROOT, fullPath), line: i + 1, text: lines[i].trim().slice(0, 200) };
          if (context_lines > 0) {
            const s = Math.max(0, i - context_lines), e = Math.min(lines.length, i + context_lines + 1);
            item.context = lines.slice(s, e).map((l, idx) => (s + idx + 1) + ': ' + l.slice(0, 150));
          }
          results.push(item);
          if (results.length >= max_results) break;
        }
      }
      if (results.length >= max_results) break;
    } catch {}
  }
  return { pattern, file_ext, scanned_files: scanned, results_count: results.length, results };
}

async function readManyFiles({ files }) {
  if (!Array.isArray(files) || !files.length) throw new Error('files must be array');
  if (files.length > 5) throw new Error('max 5 files');
  const results = [];
  for (const fp of files) {
    let found = false;
    for (const c of [fp, 'src/' + fp, 'public/' + fp]) {
      try {
        const full = resolveSafePath(c);
        const stats = await fs.stat(full);
        if (stats.size > 200 * 1024) { results.push({ file: c, error: 'too large' }); found = true; break; }
        const content = await fs.readFile(full, 'utf-8');
        results.push({ file: c, size: stats.size, content: content.slice(0, 6000), truncated: content.length > 6000 });
        found = true; break;
      } catch {}
    }
    if (!found) results.push({ file: fp, error: 'not found' });
  }
  return { count: results.length, files: results };
}

async function listFiles({ dir = '.', max_depth = 2 }) {
  const full = resolveSafePath(dir);
  const items = [];
  function scan(cur, depth) {
    if (depth > max_depth) return;
    try {
      const entries = fsSync.readdirSync(cur, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.') && e.name !== '.env.example') continue;
        if (SKIP_DIRS.has(e.name)) continue;
        const fp = path.join(cur, e.name);
        const rel = path.relative(SAFE_ROOT, fp);
        if (e.isDirectory()) { items.push({ type: 'dir', path: rel }); scan(fp, depth + 1); }
        else { items.push({ type: 'file', path: rel, size: fsSync.statSync(fp).size }); }
        if (items.length > 500) return;
      }
    } catch {}
  }
  scan(full, 0);
  return { dir, count: items.length, items: items.slice(0, 200) };
}

async function webSearch({ query, max_results = 5 }) {
  if (!query || String(query).length < 2) throw new Error('query required');
  const q = String(query).trim();
  try {
    const res = await withTimeout(fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&no_html=1&skip_disambig=1&t=sg', { headers: { 'User-Agent': 'SG/1.0' } }), SEARCH_TIMEOUT_MS, 'ddg_ia');
    if (res.ok) {
      const data = await res.json();
      const results = [];
      if (data.AbstractText) results.push({ title: data.Heading || q, snippet: String(data.AbstractText).slice(0, 400), url: cleanDdgUrl(data.AbstractURL || ''), source: 'DDG' });
      for (const t of (data.RelatedTopics || []).slice(0, max_results)) {
        if (t.Text && t.FirstURL) results.push({ title: String(t.Text).split(' - ')[0].slice(0, 120), snippet: String(t.Text).slice(0, 300), url: cleanDdgUrl(t.FirstURL), source: 'DDG' });
      }
      if (results.length > 0) return { query: q, count: results.length, results: results.slice(0, max_results), engine: 'ddg_instant' };
    }
  } catch {}
  try {
    const res = await withTimeout(fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SG/1.0)' } }), SEARCH_TIMEOUT_MS, 'ddg_html');
    if (res.ok) {
      const html = await res.text();
      const results = [];
      const regex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = regex.exec(html)) !== null && results.length < max_results) {
        const url = cleanDdgUrl(m[1]);
        const title = m[2].replace(/<[^>]*>/g, '').trim();
        const snippet = m[3].replace(/<[^>]*>/g, '').trim().slice(0, 300);
        if (title && url) results.push({ title, snippet, url, source: 'DDG HTML' });
      }
      if (results.length > 0) return { query: q, count: results.length, results, engine: 'ddg_html' };
    }
  } catch {}
  return { query: q, count: 0, results: [], error: 'no_results' };
}

async function renderEnvGet({}) {
  if (!RENDER_API_KEY) throw new Error('RENDER_API_KEY missing');
  const res = await withTimeout(fetch('https://api.render.com/v1/services/' + RENDER_SERVICE_ID + '/env-vars?limit=100', {
    headers: { Authorization: 'Bearer ' + RENDER_API_KEY, Accept: 'application/json' }
  }), TOOL_TIMEOUT_MS, 'render_env_get');
  if (!res.ok) throw new Error('Render ' + res.status);
  const raw = await res.json();
  let items = Array.isArray(raw) ? raw : (raw?.envVars || raw?.items || []);
  const vars = items.map(i => { const v = i.envVar || i; return { key: v.key || v.name || '?', value: v.value ? '***' : '' }; }).filter(v => v.key && v.key !== '?');
  return { serviceId: RENDER_SERVICE_ID, count: vars.length, vars };
}

async function renderEnvSet({ key, value }) {
  if (!RENDER_API_KEY) throw new Error('RENDER_API_KEY missing');
  if (!key) throw new Error('key required');
  const res = await withTimeout(fetch('https://api.render.com/v1/services/' + RENDER_SERVICE_ID + '/env-vars/' + encodeURIComponent(key), {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + RENDER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: String(value) })
  }), TOOL_TIMEOUT_MS, 'render_env_set');
  if (!res.ok) throw new Error('Render ' + res.status);
  return { updated: true, key, note: 'Service will redeploy automatically' };
}

async function saveSession({ name, cookies = '', headers = {}, notes = '' }) {
  if (!name) throw new Error('name required');
  ensureSessionsDir();
  const sp = path.join(SESSIONS_DIR, name + '.json');
  fsSync.writeFileSync(sp, JSON.stringify({ name, cookies, headers, notes, savedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  return { saved: true, name };
}

async function loadSession({ name }) {
  if (!name) throw new Error('name required');
  const sp = path.join(SESSIONS_DIR, name + '.json');
  try { return { loaded: true, ...JSON.parse(fsSync.readFileSync(sp, 'utf8')) }; }
  catch { throw new Error('session not found: ' + name); }
}

async function platformFetch({ url, method = 'GET', session = null, body = null, extra_headers = {} }) {
  if (!url || !url.startsWith('http')) throw new Error('valid url required');
  const headers = { ...extra_headers };
  if (session) {
    try {
      const data = JSON.parse(fsSync.readFileSync(path.join(SESSIONS_DIR, session + '.json'), 'utf8'));
      if (data.cookies) headers['cookie'] = data.cookies;
      if (data.headers) Object.assign(headers, data.headers);
    } catch {}
  }
  const res = await withTimeout(fetch(url, { method, headers, body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined }), TOOL_TIMEOUT_MS, 'platform_fetch');
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 3000); }
  return { status: res.status, ok: res.ok, setCookie: res.headers.get('set-cookie') || null, data };
}

const TOOL_MAP = {
  web_search: webSearch,
  grep_files: grepFiles,
  read_many_files: readManyFiles,
  list_files: listFiles,
  read_file: readFile,
  write_file: writeFile,
  github_api: githubApi,
  github_edit_file: githubEditFile,
  send_telegram: sendTelegram,
  shell_exec: shellExec,
  http_fetch: httpFetch,
  render_env_get: renderEnvGet,
  render_env_set: renderEnvSet,
  save_session: saveSession,
  load_session: loadSession,
  platform_fetch: platformFetch,
};

export const AVAILABLE_TOOLS = [
  { name: 'github_edit_file', description: '🆕 تعديل ملف على GitHub باستبدال نص محدد (search) بـ نص جديد (replace). ينشر تلقائياً.', params: { path: 'string (مثل src/server.js)', search: 'string (النص الأصلي)', replace: 'string (النص الجديد)', message: 'string (رسالة الـ commit)' } },
  { name: 'web_search', description: 'البحث في الإنترنت عبر DuckDuckGo.', params: { query: 'string', max_results: 'number' } },
  { name: 'grep_files', description: 'البحث في الملفات.', params: { pattern: 'string', file_ext: 'string', max_results: 'number', context_lines: 'number' } },
  { name: 'read_many_files', description: 'قراءة حتى 5 ملفات.', params: { files: 'string[]' } },
  { name: 'list_files', description: 'سرد مجلد.', params: { dir: 'string', max_depth: 'number' } },
  { name: 'read_file', description: 'قراءة ملف. يدعم start_line/end_line.', params: { file_path: 'string', start_line: 'number', end_line: 'number' } },
  { name: 'write_file', description: 'كتابة ملف محلياً.', params: { file_path: 'string', content: 'string' } },
  { name: 'github_api', description: 'استدعاء GitHub API.', params: { endpoint: 'string', method: 'string', body: 'object' } },
  { name: 'send_telegram', description: 'إرسال رسالة Telegram.', params: { chat_id: 'string', text: 'string' } },
  { name: 'shell_exec', description: 'تنفيذ shell.', params: { command: 'string', args: 'string[]' } },
  { name: 'http_fetch', description: 'طلب HTTP.', params: { url: 'string', method: 'string', headers: 'object', body: 'object' } },
  { name: 'render_env_get', description: 'قراءة متغيرات Render.', params: {} },
  { name: 'render_env_set', description: 'تعديل متغير Render.', params: { key: 'string', value: 'string' } },
  { name: 'save_session', description: 'حفظ جلسة.', params: { name: 'string', cookies: 'string', headers: 'object' } },
  { name: 'load_session', description: 'تحميل جلسة.', params: { name: 'string' } },
  { name: 'platform_fetch', description: 'fetch مع جلسة.', params: { url: 'string', method: 'string', session: 'string', body: 'object' } },
];

export async function executeTool(toolName, params = {}) {
  const fn = TOOL_MAP[toolName];
  if (!fn) return { ok: false, tool: toolName, error: 'unknown tool. Available: ' + Object.keys(TOOL_MAP).join(', ') };
  try { return { ok: true, tool: toolName, result: await fn(params) }; }
  catch (err) { return { ok: false, tool: toolName, error: err.message || String(err) }; }
}
