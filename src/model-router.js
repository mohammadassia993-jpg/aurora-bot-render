// model-router.js — temporary: all tiers use glm-4.5-flash until verified strong model available

export const MODEL_TIERS = {
  simple:  { model: 'glm-4.5-flash', maxTokens: 800,  temperature: 0.2,  label: '⚡ سريع' },
  medium:  { model: 'glm-4.5-flash', maxTokens: 1500, temperature: 0.2,  label: '⚖️ متوازن' },
  complex: { model: 'glm-4.5-flash', maxTokens: 2500, temperature: 0.15, label: '🔥 قوي' }
};

const COMPLEX_KEYWORDS = [
  'إعادة هيكلة', 'أعد كتابة', 'أعد بناء', 'refactor', 'rewrite', 'restructure',
  'ملف كامل', 'whole file', 'entire file', 'multiple files', 'عدة ملفات',
  'شامل', 'comprehensive'
];

const MEDIUM_KEYWORDS = [
  'عدّل', 'استبدل', 'أضف', 'احذف', 'أنشئ', 'اكتب',
  'edit', 'replace', 'modify', 'add', 'delete', 'create', 'write',
  'grep', 'ابحث في', 'search'
];

export function classifyTask(userMessage, options = {}) {
  const text = String(userMessage || '');
  const failures = Number(options.consecutiveFailures || 0);
  const step = Number(options.currentStep || 1);

  if (failures >= 2) return 'complex';

  const len = text.length;
  if (len > 3000) return 'complex';
  if (len > 1000) return 'medium';

  const lower = text.toLowerCase();
  if (COMPLEX_KEYWORDS.some(k => lower.includes(k.toLowerCase()))) return 'complex';
  if (MEDIUM_KEYWORDS.some(k => lower.includes(k.toLowerCase()))) return 'medium';
  if (step >= 4) return 'medium';

  return 'simple';
}

export function selectModelForTask(complexity) {
  return MODEL_TIERS[complexity] || MODEL_TIERS.simple;
}

export function describeRouter() {
  return Object.entries(MODEL_TIERS).map(([k, v]) =>
    `${v.label} ${k} → ${v.model} (max ${v.maxTokens})`
  ).join('\n');
}
