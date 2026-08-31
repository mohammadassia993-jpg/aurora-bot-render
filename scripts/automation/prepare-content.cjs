const fs = require('fs');
const path = require('path');

const DELIVERABLES_DIR = path.join(process.env.HOME, 'silent-giants/deliverables/executed');
const OUTPUT_DIR = path.join(process.env.HOME, 'silent-giants/deliverables/superteam-submissions');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const BOUNTIES = [
  {
    slug: 'zns-sol',
    title: 'ZNS Solana Creator Challenge',
    reward: '500 USDC',
    requirements: 'Create content about ZNS on Solana (X thread, infographic, tutorial)',
    tasks: ['TASK-408', 'TASK-409']
  },
  {
    slug: 'solana-summit-canada-creator-challenge-part-1',
    title: 'Solana Summit Canada Creator Challenge',
    reward: '10,000 USDG',
    requirements: 'Create content about Solana Summit Canada',
    tasks: ['TASK-410', 'TASK-411']
  },
  {
    slug: 'solana-summit-creator-grant',
    title: 'Solana Summit Creator Grant',
    reward: '2,000 USDG',
    requirements: 'Create content about Solana Summit',
    tasks: ['TASK-414', 'TASK-415']
  },
  {
    slug: 'create-content-to-engage-new-builders-for-the-hackathon',
    title: 'Create Content for New Builders',
    reward: '900 USDG',
    requirements: 'Content to engage new builders for hackathon',
    tasks: ['TASK-423', 'TASK-424']
  },
  {
    slug: 'castledao-content-challenge',
    title: 'CastleDAO Content Challenge',
    reward: '1,000 USDG',
    requirements: 'Content about CastleDAO',
    tasks: ['TASK-425', 'TASK-426']
  }
];

function findTaskFiles(taskIds) {
  const files = [];
  for (const id of taskIds) {
    const matchingFiles = fs.readdirSync(DELIVERABLES_DIR).filter(f => f.startsWith(id));
    files.push(...matchingFiles.map(f => path.join(DELIVERABLES_DIR, f)));
  }
  return files;
}

function createSubmissionPackage(bounty, taskFiles) {
  const submissionDir = path.join(OUTPUT_DIR, bounty.slug);
  if (!fs.existsSync(submissionDir)) {
    fs.mkdirSync(submissionDir, { recursive: true });
  }

  // Copy task files
  for (const file of taskFiles) {
    const fileName = path.basename(file);
    fs.copyFileSync(file, path.join(submissionDir, fileName));
  }

  // Create cover letter
  const coverLetter = `# خطاب التقديم — ${bounty.title}

**المستخدم:** ethical-copper-10
**البريد:** auroraalmada4@gmail.com
**التاريخ:** ${new Date().toISOString().split('T')[0]}

---

مرحباً فريق ${bounty.title.split(' ')[0]},

أنا ethical-copper-10، صانع محتوى Web3 متخصص في إنشاء محتوى تعليمي وإبداعي باللغتين العربية والإنجليزية.

أقدم لكم محتوى مميز عن ${bounty.title} يتضمن:

1. سلسلة منشورات على X (Twitter)
2. مقال تحليلي شامل
3. محتوى تعليمي للمبتدئين
4. رسوم توضيحية INFOGRAPHICS

**المهارات:**
- كتابة محتوى Web3 بالعربية والإنجليزية
- فهم عميق لمنصة Solana
- التزام بالمواعيد النهائية

**القيمة:** ${bounty.reward}

سأبدأ العمل فوراً بعد القبول.

مع خالص التقدير,
ethical-copper-10
auroraalmada4@gmail.com
`;

  fs.writeFileSync(path.join(submissionDir, 'cover-letter.md'), coverLetter);

  // Create README with instructions
  const readme = `# ${bounty.title}

**الجائزة:** ${bounty.reward}
**الرابط:** https://superteam.fun/listings/${bounty.slug}
**الحالة:** جاهز للتقديم

## خطوات التقديم

1. افتح الرابط أعلاه
2. اضغط "Apply"
3. أضف: auroraalmada4@gmail.com
4. ارفع الملفات من هذا المجلد
5. أرسل

## الملفات المطلوبة

${taskFiles.map(f => `- ${path.basename(f)}`).join('\n')}
- cover-letter.md (خطاب التقديم)

## ملاحظات

- الحساب: ethical-copper-10
- البريد: auroraalmada4@gmail.com
`;

  fs.writeFileSync(path.join(submissionDir, 'README.md'), readme);

  return submissionDir;
}

console.log('📦 Preparing submission packages...\n');

let totalPackages = 0;
let totalFiles = 0;

for (const bounty of BOUNTIES) {
  const taskFiles = findTaskFiles(bounty.tasks);
  
  if (taskFiles.length > 0) {
    const submissionDir = createSubmissionPackage(bounty, taskFiles);
    console.log(`✅ ${bounty.title}`);
    console.log(`   📁 ${submissionDir}`);
    console.log(`   📎 Files: ${taskFiles.length + 2} (tasks + cover letter + README)`);
    totalPackages++;
    totalFiles += taskFiles.length + 2;
  } else {
    console.log(`⚠️ ${bounty.title} — No matching task files found`);
  }
  console.log('');
}

console.log(`\n📊 Summary:`);
console.log(`   Packages: ${totalPackages}`);
console.log(`   Total files: ${totalFiles}`);
console.log(`   Output: ${OUTPUT_DIR}`);
