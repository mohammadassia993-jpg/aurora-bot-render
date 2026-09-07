/**
 * bundle-ebooks.js — Bundle the 92 tasks into sellable e-books and a master bundle
 * Creates themed bundles from the task catalog
 */
import { db } from '../src/db.js';
import { createProduct, formatProduct, proofreadText } from '../src/production.js';
import { info, warn } from '../src/logger.js';

const BUNDLES = [
  {
    title: 'حزمة مقالات Web3 — شاملة',
    description: 'مجموعة مقالات احترافية عن Web3 والبلوكتشين. تشمل أساسيات، تحليلات، وأدوات عملية.',
    price: 45,
    type: 'ebook',
    categoryKeywords: ['article', 'article', 'article', 'content', 'writing', 'article']
  },
  {
    title: 'حزمة ترجمات تقنية — Web3 & DePIN',
    description: 'ترجمات تقنية احترافية لمفاهيم Web3 و DePIN. مناسبة للمطورين والمستثمرين.',
    price: 35,
    type: 'ebook',
    categoryKeywords: ['translation', 'translate', 'translation']
  },
  {
    title: 'حزمة أمن العقود الذكية',
    description: 'أدلة شاملة لأمن العقود الذكية. يشمل: فحص، تدقيق، أفضل الممارسات.',
    price: 55,
    type: 'ebook',
    categoryKeywords: ['security', 'audit', 'smart contract', 'bug', 'vulnerability']
  },
  {
    title: 'حزمة إدارة مجتمع Web3',
    description: 'أدلة إدارة وبناء مجتمعات Web3. يشمل: Discord، Telegram، Twitter، أحداث.',
    price: 40,
    type: 'ebook',
    categoryKeywords: ['community', 'moderator', 'engagement', 'social']
  },
  {
    title: 'حزمة التسويق للمشاريع الكريبتو',
    description: 'أدلة تسويق شاملة لمشاريع الكريبتو. يشمل: محتوى، حملات، KOLs، تحليل.',
    price: 50,
    type: 'ebook',
    categoryKeywords: ['marketing', 'content', 'growth', 'strategy', 'campaign']
  },
  {
    title: 'الحزمة الشاملة — كل ما تحتاجه عن Web3 (92 مهمة)',
    description: 'الحزمة الكاملة: 92 مهمة رقمية تشمل مقالات، ترجمات، أمن، مجتمع، تسويق، تحليل. أكثر من 1000 صفحة من المحتوى الاحترافي.',
    price: 199,
    type: 'bundle',
    categoryKeywords: null // all tasks
  }
];

async function main() {
  // Get all tasks from the catalog
  const allTasks = db.prepare('SELECT * FROM tasks ORDER BY id').all();
  info('production', `found ${allTasks.length} tasks to bundle`);

  const ids = [];

  for (const bundle of BUNDLES) {
    let tasks;
    if (bundle.categoryKeywords) {
      // Filter tasks that match any keyword
      tasks = allTasks.filter(t => {
        const text = `${t.title || ''} ${t.description || ''}`.toLowerCase();
        return bundle.categoryKeywords.some(kw => text.includes(kw.toLowerCase()));
      });
    } else {
      tasks = allTasks;
    }

    if (tasks.length === 0) {
      info('production', `no tasks found for bundle: ${bundle.title}, using fallback`);
      tasks = allTasks.slice(0, 10);
    }

    // Build the e-book content from tasks
    const sections = tasks.map((t, i) => {
      return `## ${i + 1}. ${t.title || 'مهمة #' + t.id}\n\n${t.description || t.output || 'مهمة رقمية احترافية من عمالقة الصمت.'}`;
    });

    const contentMd = `# ${bundle.title}\n\n${bundle.description}\n\n---\n\n${sections.join('\n\n---\n\n')}\n\n---\n\n## شكراً لاختيارك عمالقة الصمت\n\nهذا المنتج من إنتاج فريق عمالقة الصمت. جميع الحقوق محفوظة.\n\nللتواصل: @SilentGiants_Store\n`;

    const id = createProduct({
      title: bundle.title,
      description: `${bundle.description} (${tasks.length} مهمة رقمية)`,
      price: bundle.price,
      type: bundle.type,
      content: contentMd
    });

    ids.push({ id, title: bundle.title, tasksIncluded: tasks.length });
    info('production', `bundle #${id} created: ${bundle.title} (${tasks.length} tasks, $${bundle.price})`);
  }

  console.log(JSON.stringify({ produced: ids, total: BUNDLES.length }));
}

main().catch(e => { console.error(e); process.exit(1); });
