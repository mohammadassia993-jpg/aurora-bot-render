// Execute all tasks: single persistent local LLM session, distribute to agents, save deliverables
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';

const root = path.resolve(import.meta.dirname, '..');
const outRoot = path.join(root, 'deliverables', 'executed');
fs.mkdirSync(outRoot, { recursive: true });

const MODEL_PATH = process.env.LOCAL_LLM_MODEL_PATH || '/root/.ollama/models/blobs/sha256-c5396e06af294bd101b30dce59131a76d2b773e76950acc870eda801d3ab0515';

const agents = {
  article: 'executor', translation: 'executor', audit: 'reviewer', community: 'scout',
  triage: 'planner', proposal: 'executor', application: 'executor', package: 'executor',
  glossary: 'executor', guide: 'executor', writer: 'executor', manager: 'scout',
  support: 'planner', security: 'reviewer', strategy: 'planner', technical: 'executor',
  community_manager: 'scout', researcher: 'reviewer'
};

function classify(title) {
  const t = String(title).toLowerCase();
  const rules = [
    ['translation', /ترجم|translation/], ['audit', /audit|مراجعة أمان|باحث أمان|security review/],
    ['triage', /triage|توجيه|summary/], ['community', /community|مجتمع|DAO|تقرير|engagement/],
    ['application', /application|حزم تطبيق|support role/], ['proposal', /proposal|مقترح|تقديم|strategy|استراتيجي/],
    ['manager', /community manager|قائد مجتمع/], ['security', /security|أمان/],
    ['technical', /technical|documentation|موثق/], ['glossary', /قاموس|glossary/],
    ['guide', /دليل|guide|محافظ|موسّع/], ['writer', /writer|كاتب|محتوى كريبتو/],
    ['article', /article|مقال|سلسلة|educational|تعليمي/]
  ];
  for (const [key, re] of rules) if (re.test(t)) return key;
  return 'article';
}

function slug(title) {
  return String(title).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

const prompts = {
  article: (t) => `اكتب مقالاً تحريرياً عربياً كاملاً بعنوان: «${t.title}». اجعله 5-7 فقرات بأسلوب احترافي، بمقدمة وخاتمة وعناوين فرعية، لغة عربية فصحى واضحة مناسبة لنشر Web3.`,
  translation: (t) => `أنفذ ترجمة تقنية EN→AR للموضوع: «${t.title}». قدّم: 1) القطعة الإنجليزية الأصلية المقترحة، 2) الترجمة العربية الدقيقة، 3) قائمة المصطلحات مع المرادفات.`,
  audit: (t) => `أنجز مراجعة تحليلية أمنية عربية بعنوان: «${t.title}». غطِّ: النطاق، المخاطر، التوصيات، قائمة تدقيق جاهزة.`,
  community: (t) => `اكتب تقرير إشراك مجتمعي عربياً بعنوان: «${t.title}». غطِّ: الأنشطة، مقاييس التفاعل، التحديات، خطة الأسبوع القادم.`,
  triage: (t) => `نفذ فرزاً وتلخيصاً عربياً لـ: «${t.title}». قدّم: الملخص، التصنيف، الأولوية، الخطوات الأولى.`,
  proposal: (t) => `أعدّ مقترحاً تقديمياً عربياً كاملاً: «${t.title}». مقدمة، منهجية، خطة تسليم، جدول زمني، قيمة مضافة.`,
  application: (t) => `جهّز حزمة تقديم وظيفية عربية كاملة: «${t.title}». خطاب تقديم، ملخص مهارات، نماذج أعمال، دراسة حالة.`,
  glossary: (t) => `ابنِ قاموس مصطلحات Web3 موسّعاً عربي/إنجليزي: «${t.title}». 25+ مصطلحاً مع التعريفين.`,
  guide: (t) => `اكتب دليلاً عملياً عربياً كاملاً: «${t.title}». بسّط المفاهيم وامنح خطوات قابلة للتطبيق.`,
  security: (t) => `اكتب مراجعة أمان عربية: «${t.title}». أفضل الممارسات، المخاطر الشائعة، التوصيات العملية.`,
  writer: (t) => `جهّز مجموعة عينات كتابة محتوى بلوكشين عربية: «${t.title}». اكتب 3 قطع قصيرة متنوعة (خبر، شرح، رأي).`,
  manager: (t) => `اكتب مقترح إدارة مجتمع عربياً كاملاً: «${t.title}». استراتيجية النمو، خطة المحتوى، إدارة الأزمات، مقاييس النجاح.`,
  technical: (t) => `اكتب مستنداً تقنياً عربياً: «${t.title}». نظرة عامة، متطلبات، خطوات، استنتاج.`,
  executor: (t) => `نفذ المهمة واكتب المخرجات النهائية بالعربية بشكل كامل واحترافي: «${t.title}».`,
  planner: (t) => `خطط للمهمة وقدّم خطة تنفيذية عربية مفصلة: «${t.title}».`,
  scout: (t) => `ابحث وأعدّ تقريراً عربياً: «${t.title}». قدّم الفرص والتوصيات.`
};

console.log('Loading local LLM once...');
const { getLlama, LlamaChatSession } = await import('/usr/local/lib/node_modules/openclaw/node_modules/node-llama-cpp/dist/index.js');
const llama = await getLlama();
const model = await llama.loadModel({ modelPath: MODEL_PATH });
console.log('Model ready. Starting tasks...');

const tasks = db.prepare("SELECT * FROM tasks WHERE status IN ('ready_for_approval','discovered','delegated') AND title NOT LIKE 'Configure %' AND (result_path IS NULL OR result_path='') ORDER BY id").all();
console.log(`📋 Tasks: ${tasks.length}`);
let saved = 0, drafts = 0;

for (const task of tasks) {
  const kind = classify(task.title);
  const agent = agents[kind] || 'executor';
  try {
    db.prepare("UPDATE tasks SET assigned_agent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(agent, task.id);
    const p = (prompts[agent] || prompts.executor)(task);
    const ctx = await model.createContext({ contextSize: 2048 });
    const session = new LlamaChatSession({ contextSequence: ctx.getSequence() });
    const output = (await session.prompt(p, { maxTokens: 400, temperature: 0.7 })).trim();
    await ctx.dispose();
    if (!output) throw new Error('empty');
    const file = path.join(outRoot, `TASK-${task.id}-${slug(task.title)}.md`);
    fs.writeFileSync(file, `# ${task.title}\n\n**الوكيل:** ${agent}\n**المصدر:** ${task.source}\n**القيمة:** ${task.reward} ${task.currency || ''}\n**التاريخ:** ${new Date().toISOString().slice(0,10)}\n\n---\n\n${output}\n`);
    db.prepare("UPDATE tasks SET status='drafted', result_path=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(path.relative(root, file), task.id);
    saved++;
    console.log(`✅ #${task.id} [${agent}] ${String(task.title).slice(0,40)}`);
    fs.appendFileSync(path.join(root,'logs','exec-98-live.log'), `✅ #${task.id} [${agent}] ${task.title}\n`);
  } catch (err) {
    drafts++;
    db.prepare("UPDATE tasks SET status='drafted', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(task.id);
    console.log(`⚠️ #${task.id} fallback — ${String(err.message).slice(0,40)}`);
    fs.appendFileSync(path.join(root,'logs','exec-98-live.log'), `⚠️ #${task.id} fallback ${String(err.message).slice(0,60)}\n`);
  }
}
console.log(`\n📊 Done: ${saved} saved | ${drafts} fallback`);
