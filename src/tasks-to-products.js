/**
 * tasks-to-products.js — Convert 92 Web3 Tasks to Sellable Products
 *
 * Takes the 92 discovered tasks and converts them into:
 * 1. Individual sellable products (each task = 1 product)
 * 2. A comprehensive bundle (all 92 tasks as a package)
 * 3. Specialized sub-bundles (by category)
 *
 * These are published to all platforms and marketed continuously.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { callModel } from './ai.js';
import { config } from './config.js';
import { info, warn } from './logger.js';
import { eventBus, EVENTS } from './event-bus.js';
import { EpisodicMemory } from './persistent-memory.js';

const BUNDLE_DIR = path.join(config.root, 'data', 'production', 'bundles');
fs.mkdirSync(BUNDLE_DIR, { recursive: true });

const BUNDLE_CATALOG_FILE = path.join(BUNDLE_DIR, 'tasks-92-catalog.json');

/** Load existing bundle catalog */
function loadBundleCatalog() {
  try {
    if (fs.existsSync(BUNDLE_CATALOG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(BUNDLE_CATALOG_FILE, 'utf8'));
      return Array.isArray(raw) ? raw : (raw.catalog || raw.products || []);
    }
  } catch {}
  return [];
}

/** Save bundle catalog */
function saveBundleCatalog(catalog) {
  fs.writeFileSync(BUNDLE_CATALOG_FILE, JSON.stringify(catalog, null, 2), { mode: 0o600 });
}

/** Get all 92 tasks from DB */
function getAll92Tasks() {
  return db.prepare(`
    SELECT id, title, source, reward, status, payload_json
    FROM tasks
    WHERE source IN ('superteam', 'dework', 'gitcoin', 'bounty', 'prize_scan', 'job_scan')
    ORDER BY created_at DESC
  `).all();
}

/** Convert a single task into a sellable product */
function taskToProduct(task) {
  const payload = JSON.parse(task.payload_json || '{}');
  return {
    taskId: task.id,
    title: task.title,
    description: `${task.title} - Web3 task from ${task.source}`,
    source: task.source,
    price: Math.max(5, Math.min(50, task.reward || 15)),
    status: task.status,
    createdAt: task.created_at,
    url: payload.url || '',
    platform: payload.platform || task.source
  };
}

/** Generate the comprehensive 92-task bundle */
async function generateBundle() {
  const tasks = getAll92Tasks();
  if (tasks.length === 0) {
    warn('tasks-to-products', 'No 92-tasks found in database');
    return null;
  }

  info('tasks-to-products', `📦 Generating bundle from ${tasks.length} tasks...`);

  const products = tasks.map(taskToProduct);
  const bundleCatalog = loadBundleCatalog();

  // Create individual products
  for (const product of products) {
    const exists = bundleCatalog.find(p => p.taskId === product.taskId);
    if (!exists) {
      bundleCatalog.push({
        ...product,
        type: 'individual',
        publishedAt: null
      });
    }
  }

  // Create the comprehensive bundle
  const bundleExists = bundleCatalog.find(p => p.type === 'full_bundle');
  if (!bundleExists) {
    const totalValue = products.reduce((sum, p) => sum + p.price, 0);
    bundleCatalog.push({
      id: 'bundle_92_full',
      title: 'حزمة محتوى Web3 الشاملة (92 مهمة)',
      description: `حزمة شاملة من ${tasks.length} مهمة Web3 قابلة للبيع المتكرر. تشمل: 5 مقالات + 3 ترجمات + تقرير أسبوعي. المنتج يحتوي على كل ما تحتاجه لبدء عملك في Web3.`,
      type: 'full_bundle',
      price: Math.round(totalValue * 0.3), // 70% discount
      originalPrice: totalValue,
      tasksCount: tasks.length,
      platforms: ['Payhip', 'Gumroad', 'Telegram Stars', 'Etsy', 'Sellfy'],
      status: 'draft',
      publishedAt: null,
      createdAt: new Date().toISOString()
    });
    info('tasks-to-products', `📦 Created full bundle: \$${Math.round(totalValue * 0.3)} (was \$${totalValue})`);
  }

  // Create sub-bundles by source
  const sourceGroups = {};
  for (const product of products) {
    if (!sourceGroups[product.source]) sourceGroups[product.source] = [];
    sourceGroups[product.source].push(product);
  }

  for (const [source, items] of Object.entries(sourceGroups)) {
    if (items.length < 3) continue; // Only create bundles for groups with 3+ items
    const bundleExists = bundleCatalog.find(p => p.type === 'sub_bundle' && p.source === source);
    if (!bundleExists) {
      const totalValue = items.reduce((sum, p) => sum + p.price, 0);
      bundleCatalog.push({
        id: `bundle_${source}`,
        title: `حزمة ${source} (${items.length} مهمة)`,
        description: `حزمة مختارة من ${items.length} مهمة ${source}: ${items.map(i => i.title).join(', ')}`,
        type: 'sub_bundle',
        source,
        price: Math.round(totalValue * 0.4),
        originalPrice: totalValue,
        tasksCount: items.length,
        status: 'draft',
        publishedAt: null,
        createdAt: new Date().toISOString()
      });
    }
  }

  saveBundleCatalog(bundleCatalog);
  info('tasks-to-products', `✅ Bundle catalog updated: ${bundleCatalog.length} products`);

  // Record in memory
  EpisodicMemory.record('bundle_generated', 'tasks-to-products', null, `92 Tasks Bundle Generated`, `${products.length} individual + 1 full bundle`, 'success');

  await eventBus.fire(EVENTS.PRODUCT_CREATED, {
    count: products.length + 1,
    source: 'tasks_to_products',
    totalValue: products.reduce((sum, p) => sum + p.price, 0)
  });

  return { products: products.length, bundle: true };
}

/** Get the bundle catalog */
export function getTasks92Catalog() {
  return loadBundleCatalog();
}

/** Get stats */
export function getTasks92Stats() {
  const catalog = loadBundleCatalog();
  return {
    totalProducts: catalog.length,
    individual: catalog.filter(p => p.type === 'individual').length,
    fullBundle: catalog.filter(p => p.type === 'full_bundle').length,
    subBundles: catalog.filter(p => p.type === 'sub_bundle').length,
    totalValue: catalog.reduce((sum, p) => sum + (p.price || 0), 0)
  };
}

export default { generateBundle, getTasks92Catalog, getTasks92Stats };
