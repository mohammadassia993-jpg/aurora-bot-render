// rag.js — Retrieval-Augmented Generation
// فهرس بسيط لكل ملفات المشروع — يستخدم SQLite FTS5
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { config } from './config.js';

const INDEXABLE_EXT = ['.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.html', '.css', '.yaml', '.yml'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'data', 'logs', 'dist', '.cache', 'uploads', 'backups', 'deliverables', '.next']);
const MAX_FILE_SIZE = 100 * 1024;

let indexedCount = 0;

export function initRagIndex() {
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS rag_index USING fts5(file_path, content, tokenize='unicode61');`);
    console.log('[rag] FTS5 index initialized');
  } catch (e) {
    console.error('[rag] init failed:', e.message);
  }
}

export function indexProject() {
  try { db.prepare('DELETE FROM rag_index').run(); } catch {}

  const files = [];
  function walk(dir, depth = 0) {
    if (depth > 5) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (INDEXABLE_EXT.includes(ext)) {
          try {
            const s = fs.statSync(full);
            if (s.size <= MAX_FILE_SIZE) files.push({ path: full });
          } catch {}
        }
      }
    }
  }
  walk(config.root);

  const insert = db.prepare('INSERT INTO rag_index(file_path, content) VALUES (?, ?)');
  const tx = db.transaction((items) => {
    for (const f of items) {
      try {
        const rel = path.relative(config.root, f.path);
        const content = fs.readFileSync(f.path, 'utf8');
        insert.run(rel, content);
      } catch (e) {
        console.warn('[rag] skip ' + f.path + ': ' + e.message);
      }
    }
  });

  tx(files);
  indexedCount = files.length;
  console.log(`[rag] indexed ${files.length} files`);
  return files.length;
}

export function searchRag(query, limit = 3) {
  if (!query || query.length < 3) return [];
  try {
    const clean = String(query).replace(/[^\w\s\u0600-\u06FF]+/g, ' ').trim();
    if (!clean) return [];
    const words = clean.split(/\s+/).filter(w => w.length > 2).slice(0, 8);
    if (!words.length) return [];

    const fts = words.map(w => '"' + w + '"').join(' OR ');
    const rows = db.prepare(`
      SELECT file_path,
             snippet(rag_index, 1, '[', ']', ' … ', 15) AS snippet,
             rank
      FROM rag_index
      WHERE rag_index MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(fts, limit);
    return rows;
  } catch (e) {
    console.error('[rag] search failed:', e.message);
    return [];
  }
}

export function buildRagContext(userMessage, maxSnippets = 3) {
  const results = searchRag(userMessage, maxSnippets);
  if (!results.length) return '';

  const lines = ['📖 سياق ذو صلة من المشروع:'];
  for (const r of results) {
    lines.push('');
    lines.push(`📄 ${r.file_path}:`);
    lines.push(String(r.snippet || '').slice(0, 400));
  }
  return lines.join('\n');
}

export function getRagStatus() {
  try {
    const count = db.prepare('SELECT COUNT(*) AS c FROM rag_index').get().c;
    return { indexed: indexedCount, rows: count };
  } catch (e) {
    return { error: e.message };
  }
}
