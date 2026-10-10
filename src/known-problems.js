// known-problems.js — قائمة المشاكل الفعلية لمنظومة عمالقة الصمت
// يتم تحديثها يدوياً. وكيل المطور يبحث عن حلول لها.

export const KNOWN_PROBLEMS = [
  {
    id: 'chunked-write',
    title: 'Chunked Write لا يعمل',
    keywords: ['chunked file write llm', 'multi-step file edit agent', 'large file generation llm'],
    category: 'ai-agent'
  },
  {
    id: 'json-complex',
    title: 'JSON معقد يفشل مع النماذج الضعيفة',
    keywords: ['robust json output llm', 'structured output fallback', 'json repair llm'],
    category: 'ai-agent'
  },
  {
    id: 'free-providers-syria',
    title: 'نحتاج مزودي AI يعملون من سوريا',
    keywords: ['free llm api no signup', 'open source llm api free', 'llm api no credit card'],
    category: 'ai-provider'
  },
  {
    id: 'sqlite-cloud',
    title: 'قاعدة بيانات دائمة مجانية',
    keywords: ['free sqlite cloud', 'serverless database free tier', 'sqlite over http free'],
    category: 'database'
  },
  {
    id: 'long-context-memory',
    title: 'ذاكرة طويلة للمحادثات بدون هلوسة',
    keywords: ['long context memory llm', 'conversation summarization agent', 'rag memory chat'],
    category: 'memory'
  },
  {
    id: 'multi-provider-fallback',
    title: 'نظام تبديل ذكي بين مزودي AI',
    keywords: ['llm provider fallback router', 'multi provider load balancing llm'],
    category: 'ai-agent'
  }
];
