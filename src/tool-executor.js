// tool-executor.js (ESM) — 15 أداة كاملة
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
    const uddgMatch = u.match(/[?&]uddg=([^&]+)/);
    if (uddgMatch) return decodeURIComponent(uddgMatch[1]);
    return u;
  } catch { return String(url); }
}

function ensureSessionsDir() {
  try { fsSync.mkdirSync(SESSIONS_DIR, { recursive: true }); } catch { /* ignore */ }
}

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

async function readFile({ file_path }) {
  const candidates = [file_path, 'src/' + file_path, 'public/' + file_path];
  for (const candidate of candidates) {
    try {
      const full = resolveSafePath(candidate);
      const content = await fs.readFile(full, 'utf-8');
      return { path: candidate, content: content.slice(0, 8000), truncated: content.length > 8000 };
    } catch { /* try next */ }
  }
  throw new Error('file not found: ' + file_path);
}

async function writeFile({ file_path, content }) {
  const full = resolveSafePath(file_path);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf-8');
  return { written: true, path: file_path, bytes: Buffer.byteLength(content) };
}

async function grepFiles({ pattern, file_ext = '.js', max_results = 30 }) {
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
          results.push({ file: path.relative(SAFE_ROOT, fullPath), line: i + 1, text: lines[i].trim().slice(0, 200) });
          if (results.length >= max_results) break;
        }
      }
      if (results.length >= max_results) break;
    } catch { /* skip */ }
  }
  return { pattern, file_ext, scanned_files: scanned, results_count: results.length, results };
}

async function readManyFiles({ files }) {
  if (!Array.isArray(files) || !files.length) throw new Error('files must be array');
  if (files.length > 5) throw new Error('max 5 files');
  const results = [];
  for (const fp of files) {
    let found = false;
    const candidates = [fp, 'src/' + fp, 'public/' + fp];
    for (const candidate of candidates) {
      try {
        const full = resolveSafePath(candidate);
        const stats = await fs.stat(full);
        if (stats.size > 200 * 1024) { results.push({ file: candidate, error: 'file too large' }); found = true; break; }
        const content = await fs.readFile(full, 'utf-8');
        results.push({ file: candidate, size: stats.size, content: content.slice(0, 6000), truncated: content.length > 6000 });
        found = true;
        break;
      } catch { /* try next */ }
    }
    if (!found) results.push({ file: fp, error: 'not found' });
  }
  return { count: results.length, files: results };
}

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
        if (entry.isDirectory()) { items.push({ type: 'dir', path: rel }); scan(fullPath, depth + 1); }
        else { const stats = fsSync.statSync(fullPath); items.push({ type: 'file', path: rel, size: stats.size }); }
        if (items.length > 500) return;
      }
    } catch { /* skip */ }
  }
  scan(full, 0);
  return { dir, count: items.length, items: items.slice(0, 200) };
}

async function webSearch({ query, max_results = 5 }) {
  if (!query || String(query).length < 2) throw new Error('query required');
  const q = String(query).trim();
  try {
    const iaUrl = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&no_html=1&skip_disambig=1&t=silent-giants';
    const res = await withTimeout(fetch(iaUrl, { headers: { 'User-Agent': 'SilentGiants/1.0' } }), SEARCH_TIMEOUT_MS, 'ddg_ia');
    if (res.ok) {
      const data = await res.json();
      const results = [];
      if (data.AbstractText) results.push({ title: data.Heading || q, snippet: String(data.AbstractText).slice(0, 400), url: cleanDdgUrl(data.AbstractURL || ''), source: 'DuckDuckGo' });
      const topics = (data.RelatedTopics || []).slice(0, max_results);
      for (const topic of topics) {
        if (topic.Text && topic.FirstURL) results.push({ title: String(topic.Text).split(' - ')[0].slice(0, 120), snippet: String(topic.Text).slice(0, 300), url: cleanDdgUrl(topic.FirstURL), source: 'DuckDuckGo' });
        else if (topic.Topics) for (const sub of topic.Topics.slice(0, 2)) if (sub.Text && sub.FirstURL) results.push({ title: String(sub.Text).split(' - ')[0].slice(0, 120), snippet: String(sub.Text).slice(0, 300), url: cleanDdgUrl(sub.FirstURL), source: 'DuckDuckGo' });
      }
      if (results.length > 0) return { query: q, count: results.length, results: results.slice(0, max_results), engine: 'ddg_instant' };
    }
  } catch { /* fallback */ }
  try {
    const htmlUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
    const res = await withTimeout(fetch(htmlUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SilentGiants/1.0)' } }), SEARCH_TIMEOUT_MS, 'ddg_html');
    if (res.ok) {
      const html = await res.text();
      const results = [];
      const regex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let match;
      while ((match = regex.exec(html)) !== null && results.length < max_results) {
        const url = cleanDdgUrl(match[1]);
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        const snippet = match[3].replace(/<[^>]*>/g, '').trim().slice(0, 300);
        if (title && url) results.push({ title, snippet, url, source: 'DuckDuckGo HTML' });
      }
      if (results.length > 0) return { query: q, count: results.length, results, engine: 'ddg_html' };
    }
  } catch { /* no result */ }
  return { query: q, count: 0, results: [], error: 'no_results' };
}

// ═══════════════════════════════════════════════════════════
// render_env_get — مُصلَح (يقرأ envVar.key بشكل صحيح)
// ═══════════════════════════════════════════════════════════
async function renderEnvGet({}) {
  if (!RENDER_API_KEY) throw new Error('RENDER_API_KEY missing in Environment');
  const url = 'https://api.render.com/v1/services/' + RENDER_SERVICE_ID + '/env-vars?limit=100';
  const res = await withTimeout(fetch(url, {
    headers: { Authorization: 'Bearer ' + RENDER_API_KEY, Accept: 'application/json' }
  }), TOOL_TIMEOUT_MS, 'render_env_get');
  if (!res.ok) throw new Error('Render ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const raw = await res.json();

  let items = [];
  if (Array.isArray(raw)) items = raw;
  else if (raw && Array.isArray(raw.envVars)) items = raw.envVars;
  else if (raw && Array.isArray(raw.items)) items = raw.items;

  const vars = items.map(item => {
    const v = item.envVar || item;
    return { key: v.key || v.name || '?', value: v.value ? '***' : '' };
  }).filter(v => v.key && v.key !== '?');

  return { serviceId: RENDER_SERVICE_ID, count: vars.length, vars };
}

async function renderEnvSet({ key, value }) {
  if (!RENDER_API_KEY) throw new Error('RENDER_API_KEY missing in Environment');
  if (!key || typeof key !== 'string') throw new Error('key required');
  const url = 'https://api.render.com/v1/services/' + RENDER_SERVICE_ID + '/env-vars/' + encodeURIComponent(key);
  const res = await withTimeout(fetch(url, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + RENDER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: String(value) })
  }), TOOL_TIMEOUT_MS, 'render_env_set');
  if (!res.ok) throw new Error('Render ' + res.status + ': ' + (await res.text()).slice(0, 300));
  return { updated: true, key, serviceId: RENDER_SERVICE_ID, note: 'Service will redeploy automatically' };
}

async function saveSession({ name, cookies = '', headers = {}, notes = '' }) {
  if (!name || typeof name !== 'string') throw new Error('name required');
  ensureSessionsDir();
  const sessionPath = path.join(SESSIONS_DIR, name + '.json');
  const data = { name, cookies, headers, notes, savedAt: new Date().toISOString() };
  fsSync.writeFileSync(sessionPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  return { saved: true, name, path: sessionPath };
}

async function loadSession({ name }) {
  if (!name || typeof name !== 'string') throw new Error('name required');
  const sessionPath = path.join(SESSIONS_DIR, name + '.json');
  try {
    const data = JSON.parse(fsSync.readFileSync(sessionPath, 'utf8'));
    return { loaded: true, ...data };
  } catch (e) { throw new Error('session not found: ' + name); }
}

async function platformFetch({ url, method = 'GET', session = null, body = null, extra_headers = {} }) {
  if (!url || !url.startsWith('http')) throw new Error('valid url required');
  const headers = { ...extra_headers };
  if (session) {
    try {
      const sessionPath = path.join(SESSIONS_DIR, session + '.json');
      const data = JSON.parse(fsSync.readFileSync(sessionPath, 'utf8'));
      if (data.cookies) headers['cookie'] = data.cookies;
      if (data.headers) Object.assign(headers, data.headers);
    } catch { /* no session */ }
  }
  const res = await withTimeout(fetch(url, {
    method, headers,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  }), TOOL_TIMEOUT_MS, 'platform_fetch');
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 3000); }
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, ok: res.ok, setCookie: setCookie || null, data };
}

const TOOL_MAP = {
  web_search: webSearch,
  grep_files: grepFiles,
  read_many_files: readManyFiles,
  list_files: listFiles,
  read_file: readFile,
  write_file: writeFile,
  github_api: githubApi,
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
  { name: 'web_search', description: 'البحث في الإنترنت عبر DuckDuckGo.', params: { query: 'string', max_results: 'number' } },
  { name: 'grep_files', description: 'البحث عن نص في كل ملفات المشروع.', params: { pattern: 'string', file_ext: 'string', max_results: 'number' } },
  { name: 'read_many_files', description: 'قراءة حتى 5 ملفات دفعة.', params: { files: 'string[]' } },
  { name: 'list_files', description: 'سرد مجلد.', params: { dir: 'string', max_depth: 'number' } },
  { name: 'read_file', description: 'قراءة ملف واحد.', params: { file_path: 'string' } },
  { name: 'write_file', description: 'كتابة/تعديل ملف.', params: { file_path: 'string', content: 'string' } },
  { name: 'github_api', description: 'استدعاء GitHub API.', params: { endpoint: 'string', method: 'string', body: 'object' } },
  { name: 'send_telegram', description: 'إرسال رسالة Telegram.', params: { chat_id: 'string', text: 'string' } },
  { name: 'shell_exec', description: 'تنفيذ shell (npm/git/node/npx).', params: { command: 'string', args: 'string[]' } },
  { name: 'http_fetch', description: 'طلب HTTP عام.', params: { url: 'string', method: 'string', headers: 'object', body: 'object' } },
  { name: 'render_env_get', description: 'قراءة كل متغيرات Render.', params: {} },
  { name: 'render_env_set', description: 'إضافة/تعديل متغير في Render.', params: { key: 'string', value: 'string' } },
  { name: 'save_session', description: 'حفظ cookies/headers لجلسة منصة.', params: { name: 'string', cookies: 'string', headers: 'object' } },
  { name: 'load_session', description: 'استرجاع جلسة محفوظة.', params: { name: 'string' } },
  { name: 'platform_fetch', description: 'fetch مع جلسة محفوظة.', params: { url: 'string', method: 'string', session: 'string', body: 'object' } },
];

export async function executeTool(toolName, params = {}) {
  const fn = TOOL_MAP[toolName];
  if (!fn) return { ok: false, tool: toolName, error: 'unknown tool. Available: ' + Object.keys(TOOL_MAP).join(', ') };
  try {
    const result = await fn(params);
    return { ok: true, tool: toolName, result };
  } catch (err) {
    return { ok: false, tool: toolName, error: err.message || String(err) };
  }
}
