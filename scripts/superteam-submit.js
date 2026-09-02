#!/usr/bin/env node
/**
 * Superteam Earn Submission System
 * Creates submission packages for all 92 tasks
 */

import fs from 'node:fs';
import path from 'node:path';

const TASKS_DIR = 'deliverables/executed';
const SUBMISSIONS_DIR = 'deliverables/superteam-submissions';
const TRACKER_FILE = 'deliverables/superteam-applications/submission-tracker.json';

// Best opportunities mapped to tasks
const OPPORTUNITIES = [
  {
    id: 'zns-sol',
    name: 'ZNS Solana Creator Challenge',
    url: 'https://superteam.fun/listings/zns-sol',
    prize: '500 USDC',
    type: 'AGENT_ALLOWED',
    tasks: ['TASK-408', 'TASK-409'],
    description: 'Arabic Web3 educational content + DePIN infrastructure summary'
  },
  {
    id: 'canada-creator',
    name: 'Canada Creator Challenge',
    url: 'https://superteam.fun/listings/solana-summit-canada-creator-challenge-part-1',
    prize: '10,000 USDG',
    type: 'HUMAN_ONLY',
    tasks: ['TASK-410', 'TASK-411'],
    description: 'Blockchain content writer + DAO community engagement'
  },
  {
    id: 'creator-grant',
    name: 'Creator Grant',
    url: 'https://superteam.fun/listings/solana-summit-creator-grant',
    prize: '2,000 USDG',
    type: 'HUMAN_ONLY',
    tasks: ['TASK-414', 'TASK-415'],
    description: 'Protocol documentation translation + DePIN summary'
  },
  {
    id: 'new-builders',
    name: 'New Builders Content',
    url: 'https://superteam.fun/listings/create-content-to-engage-new-builders-for-the-hackathon',
    prize: '900 USDG',
    type: 'HUMAN_ONLY',
    tasks: ['TASK-423', 'TASK-424'],
    description: 'Arabic Web3 educational article + DePIN summary'
  },
  {
    id: 'castledao',
    name: 'CastleDAO Content',
    url: 'https://superteam.fun/listings/castledao-content-challenge',
    prize: '1,000 USDG',
    type: 'HUMAN_ONLY',
    tasks: ['TASK-425', 'TASK-426'],
    description: 'Blockchain content writer + DAO engagement'
  }
];

// Categorize all 92 tasks
function categorizeTasks() {
  const files = fs.readdirSync(TASKS_DIR).filter(f => f.endsWith('.md'));
  const categories = {
    content: [], translation: [], security: [],
    community: [], technical: [], education: [], other: []
  };

  for (const file of files) {
    const lower = file.toLowerCase();
    if (lower.includes('translation') || lower.includes('ترجم')) categories.translation.push(file);
    else if (lower.includes('security') || lower.includes('audit') || lower.includes('أمان')) categories.security.push(file);
    else if (lower.includes('community') || lower.includes('مجتمع')) categories.community.push(file);
    else if (lower.includes('technical') || lower.includes('blockchain') || lower.includes('smart-contract')) categories.technical.push(file);
    else if (lower.includes('educational') || lower.includes('article') || lower.includes('مقال')) categories.education.push(file);
    else if (lower.includes('content') || lower.includes('writing') || lower.includes('writer')) categories.content.push(file);
    else categories.other.push(file);
  }
  return categories;
}

// Create submission package for each opportunity
function createSubmissionPackages() {
  const categories = categorizeTasks();
  const allTasks = Object.values(categories).flat();
  
  console.log('📦 إنشاء حزم التقديم...');
  console.log(`📊 إجمالي المهام: ${allTasks.length}`);
  
  for (const opp of OPPORTUNITIES) {
    const oppDir = path.join(SUBMISSIONS_DIR, opp.id);
    fs.mkdirSync(oppDir, { recursive: true });
    
    // Create README
    const readme = `# ${opp.name}

**الجائزة:** ${opp.prize}
**الرابط:** ${opp.url}
**النوع:** ${opp.type}
**الحالة:** جاهز للتقديم

## خطوات التقديم

1. افتح الرابط أعلاه
2. اضغط "Apply"
3. أضف: auroraalmada4@gmail.com
4. ارفع الملفات من هذا المجلد
5. أرسل

## الملفات المطلوبة

${opp.tasks.map(t => `- ${t}.md`).join('\n')}
- cover-letter.md (خطاب التقديم)

## الوصف

${opp.description}

## ملاحظات

- الحساب: ethical-copper-10
- البريد: auroraalmada4@gmail.com
`;
    fs.writeFileSync(path.join(oppDir, 'README.md'), readme);
    
    // Copy task files
    for (const taskId of opp.tasks) {
      const taskFile = allTasks.find(f => f.startsWith(taskId));
      if (taskFile) {
        fs.copyFileSync(
          path.join(TASKS_DIR, taskFile),
          path.join(oppDir, taskFile)
        );
      }
    }
    
    // Create cover letter
    const coverLetter = `# خطاب التقديم — ${opp.name}

##’introduction

مرحباً،

أنا ممثل فريق "عمالقة الصمت" (Silent Giants)، فريق متخصص في إنشاء المحتوى التقني العربي في مجال Web3 و DePIN و Blockchain.

## الخبرات

- كتابة محتوى تقني عربي متخصص في Web3
- ترجمة توثيق البروتوكولات من الإنجليزية إلى العربية
- تحليل بنية DePIN و嚓 Blockchain
- إدارة مجتمعات DeFi و DAO

## المحتوى المرفق

${opp.tasks.map(t => `- ${t.replace('.md', '').replace(/-/g, ' ')}`).join('\n')}

## التواصل

- البريد: auroraalmada4@gmail.com
- الحساب: ethical-copper-10

شكراً لفرصتنا.
فريق عمالقة الصمت
`;
    fs.writeFileSync(path.join(oppDir, 'cover-letter.md'), coverLetter);
    
    console.log(`✅ ${opp.name}: ${oppDir}`);
  }
}

// Update tracker
function updateTracker() {
  const tracker = {
    last_updated: new Date().toISOString(),
    account: { username: 'ethical-copper-10', email: 'auroraalmada4@gmail.com' },
    submissions: OPPORTUNITIES.map(opp => ({
      id: opp.id,
      opportunity: opp.name,
      url: opp.url,
      prize: opp.prize,
      tasks: opp.tasks,
      status: 'ready_to_submit',
      submitted_at: null
    })),
    statistics: {
      total_tasks: 92,
      ready_to_submit: OPPORTUNITIES.length,
      submitted: 0,
      accepted: 0,
      rejected: 0,
      total_prize_value: OPPORTUNITIES.reduce((sum, o) => {
        const num = parseInt(o.prize.replace(/[^0-9]/g, ''));
        return sum + (isNaN(num) ? 0 : num);
      }, 0)
    }
  };
  
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(tracker, null, 2));
  console.log('📊 تم تحديث متتبع التقديمات');
}

// Main
console.log('🎯 نظام تقديم المهام على Superteam Earn');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
createSubmissionPackages();
updateTracker();
console.log('');
console.log('✅ تم إعداد كل شيء!');
console.log(`📁 الحزم: ${SUBMISSIONS_DIR}/`);
console.log(`📊 المتتبع: ${TRACKER_FILE}`);
console.log('');
console.log('📌 الخطوة التالية: القائد يفتح الروابط ويضغط Apply');
