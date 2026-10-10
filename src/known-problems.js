// known-problems.js — قائمة المشاكل الفعلية لمنظومة عمالقة الصمت
// كلمات البحث مُحسّنة لـ GitHub Search API (star-based)

export const KNOWN_PROBLEMS = [
  {
    id: 'chunked-write',
    title: 'Chunked Write لا يعمل',
    githubQuery: 'llm agent file writer streaming stars:>100',
    category: 'ai-agent'
  },
  {
    id: 'json-complex',
    title: 'JSON معقد يفشل مع النماذج الضعيفة',
    githubQuery: 'llm structured output json validation stars:>100',
    category: 'ai-agent'
  },
  {
    id: 'free-providers-syria',
    title: 'نحتاج مزودي AI يعملون من سوريا',
    githubQuery: 'llm api proxy free openai compatible stars:>50',
    category: 'ai-provider'
  },
  {
    id: 'sqlite-cloud',
    title: 'قاعدة بيانات دائمة مجانية',
    githubQuery: 'sqlite cloud serverless edge stars:>50',
    category: 'database'
  },
  {
    id: 'long-context-memory',
    title: 'ذاكرة طويلة للمحادثات بدون هلوسة',
    githubQuery: 'llm long term memory rag agent stars:>200',
    category: 'memory'
  },
  {
    id: 'multi-provider-fallback',
    title: 'نظام تبديل ذكي بين مزودي AI',
    githubQuery: 'llm multi provider router fallback stars:>50',
    category: 'ai-agent'
  },
  {
    id: 'telegram-bot-framework',
    title: 'تحسين بوت تيليجرام',
    githubQuery: 'telegram bot nodejs framework stars:>200',
    category: 'telegram'
  },
  {
    id: 'agent-orchestration',
    title: 'تحسين تنسيق الوكلاء',
    githubQuery: 'multi agent orchestration framework stars:>500',
    category: 'ai-agent'
  }
];
