/**
 * knowledge-base.js — Persistent Knowledge + Mem0 Memory
 * 
 * Loads rules, mistakes, bug_patterns from local files.
 * Syncs key knowledge to Mem0 cloud memory.
 * Provides lookup functions for decision-making.
 */

import fs from 'node:fs';
import path from 'node:path';
import { info } from './logger.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const MEM0_API = 'https://api.mem0.ai/v1';
const MEM0_KEY = process.env.MEM0_API_KEY; // must be set in .env — never hardcode
const MEM0_USER = 'user_f660ba7ee41f';

let _rules = [];
let _mistakes = [];
let _bugPatterns = [];

function loadJson(filename) {
  try {
    const fp = path.join(DATA_DIR, filename);
    if (!fs.existsSync(fp)) return [];
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch { return []; }
}

/**
 * Initialize knowledge base
 */
export function initKnowledgeBase() {
  _rules = loadJson('rules.json');
  _mistakes = loadJson('mistakes.json');
  _bugPatterns = loadJson('bug_patterns.json');
  info('knowledge-base', `Loaded: ${_rules.length} rules, ${_mistakes.length} mistakes, ${_bugPatterns.length} patterns`);
  syncToMem0();
  return { rules: _rules.length, mistakes: _mistakes.length, patterns: _bugPatterns.length };
}

/**
 * Sync critical knowledge to Mem0 cloud
 */
async function syncToMem0() {
  try {
    const summary = `System rules: ${_rules.map(r=>r.rule).join(', ')}. Recent mistakes: ${_mistakes.slice(-3).map(m=>m.title).join('; ')}. Bug patterns: ${_bugPatterns.map(b=>b.name).join(', ')}.`;
    await fetch(`${MEM0_API}/memories/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${MEM0_KEY}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: `Update my knowledge base: ${summary}` }], user_id: MEM0_USER })
    });
    info('knowledge-base', 'Synced to Mem0');
  } catch (e) {
    info('knowledge-base', `Mem0 sync failed: ${e.message?.slice(0, 80)}`);
  }
}

/**
 * Retrieve relevant memories from Mem0 before a task
 */
export async function recallMemory(query) {
  try {
    const r = await fetch(`${MEM0_API}/memories/search/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${MEM0_KEY}` },
      body: JSON.stringify({ query, user_id: MEM0_USER, top_k: 5 })
    });
    const data = await r.json();
    return data.results || data.memories || [];
  } catch { return []; }
}

export function hasRule(ruleName) { return _rules.some(r => r.rule === ruleName); }
export function getRule(ruleName) { return _rules.find(r => r.rule === ruleName); }
export function getAllRules() { return _rules.map(r => `${r.rule}: ${r.description}`).join('\n'); }
export function getRecentMistakes(n = 5) { return _mistakes.slice(-n); }
export function hasMistake(kw) { return _mistakes.some(m => JSON.stringify(m).toLowerCase().includes(kw.toLowerCase())); }

export default { initKnowledgeBase, recallMemory, hasRule, getRule, getAllRules, getRecentMistakes, hasMistake };
