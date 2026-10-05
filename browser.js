// browser.js — Browser automation via Browserless.io
import { chromium } from 'playwright-core';
import { info, warn, error } from './logger.js';

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || '';
const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'wss://production-sfo.browserless.io';
const BROWSERLESS_ENABLED = process.env.BROWSERLESS_ENABLED === 'true';
const DEFAULT_TIMEOUT = 30000;

let browserInstance = null;

function buildWsEndpoint() {
  if (!BROWSERLESS_TOKEN) return null;
  const base = BROWSERLESS_URL.replace(/\/$/, '');
  return base + '/chromium?token=' + BROWSERLESS_TOKEN;
}

export function isEnabled() {
  return BROWSERLESS_ENABLED && Boolean(BROWSERLESS_TOKEN);
}

async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  const wsUrl = buildWsEndpoint();
  if (!wsUrl) throw new Error('BROWSERLESS_TOKEN not set');
  info('browser', 'Connecting to Browserless...');
  browserInstance = await chromium.connectOverCDP(wsUrl, { timeout: DEFAULT_TIMEOUT });
  info('browser', 'Connected');
  return browserInstance;
}

export async function closeBrowser() {
  if (browserInstance) {
    try { await browserInstance.close(); } catch (e) {}
    browserInstance = null;
  }
}

export async function browseUrl(url, options = {}) {
  if (!isEnabled()) throw new Error('Browserless disabled');
  if (!url || !url.startsWith('http')) throw new Error('Invalid URL');
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 }
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: options.waitUntil || 'domcontentloaded', timeout: options.timeout || DEFAULT_TIMEOUT });
    if (options.waitMs) await page.waitForTimeout(options.waitMs);
    const title = await page.title();
    const text = await page.evaluate(() => document.body ? document.body.innerText : '');
    const links = await page.evaluate(() => {
      const out = [];
      const anchors = document.querySelectorAll('a[href]');
      for (let i = 0; i < Math.min(anchors.length, 30); i++) {
        const a = anchors[i];
        out.push({ text: (a.innerText || '').trim().slice(0, 100), href: a.href });
      }
      return out;
    });
    return { ok: true, url, title, text: String(text).slice(0, 5000), links, textLength: String(text).length };
  } finally {
    try { await context.close(); } catch (e) {}
  }
}

export async function takeScreenshot(url, options = {}) {
  if (!isEnabled()) throw new Error('Browserless disabled');
  if (!url || !url.startsWith('http')) throw new Error('Invalid URL');
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeout || DEFAULT_TIMEOUT });
    if (options.waitMs) await page.waitForTimeout(options.waitMs);
    const buffer = await page.screenshot({ fullPage: options.fullPage || false, type: 'png' });
    return { ok: true, url, bytes: buffer.length, base64: buffer.toString('base64') };
  } finally {
    try { await context.close(); } catch (e) {}
  }
}

export async function extractText(url, options = {}) {
  const r = await browseUrl(url, options);
  return { ok: true, url, title: r.title, text: r.text, textLength: r.textLength };
}

export async function searchGoogle(query, options = {}) {
  if (!query) throw new Error('query required');
  const url = 'https://duckduckgo.com/html/?q=' + encodeURIComponent(query);
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeout || DEFAULT_TIMEOUT });
    await page.waitForTimeout(1500);
    const results = await page.evaluate(() => {
      const out = [];
      const items = document.querySelectorAll('.result, .web-result');
      for (let i = 0; i < Math.min(items.length, 10); i++) {
        const item = items[i];
        const linkEl = item.querySelector('.result__a, a.result__url');
        const snipEl = item.querySelector('.result__snippet');
        if (linkEl) out.push({ title: (linkEl.innerText || '').trim().slice(0, 200), href: linkEl.href || '', snippet: snipEl ? (snipEl.innerText || '').trim().slice(0, 300) : '' });
      }
      return out;
    });
    return { ok: true, query, count: results.length, results };
  } finally {
    try { await context.close(); } catch (e) {}
  }
}
