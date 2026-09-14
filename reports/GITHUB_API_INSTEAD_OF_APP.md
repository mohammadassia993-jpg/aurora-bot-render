# GITHUB_API_INSTEAD_OF_APP.md — GitHub API بدل GitHub App

**التاريخ:** 2026-09-14
**الحالة:** ✅ مكتمل

## القرار:
لا حاجة لـ GitHub App. PAT الحالي (repo scope) كافٍ لكل العمليات.

## ما تم بناؤه:
- `src/github-api.js` — وحدة GitHub API متكاملة:
  - `createIssue(title, body, labels)` — فتح Issue
  - `createPR(title, head, base, body)` — إنشاء PR
  - `mergePR(prNumber)` — دمج PR
  - `commentIssue(issueNumber, body)` — التعليق على Issue
  - `listIssues(state)` — قائمة Issues
  - `getRepoHealth()` — فحص صحة المستودع

## الاختبار:
```json
{
  "openIssues": 0,
  "openPRs": 0,
  "issues": [],
  "prs": []
}
```
✅ نجح — PAT يعمل بشكل ممتاز

## المزايا:
- لا يحتاج OAuth
- لا يحتاج GitHub App
- لا يحتاج تثبيت Bot
- PAT واحد يكفي لكل شيء
- يعمل داخل Render مباشرة

## الربط مع Self-Healing:
- عند اكتشاف مشكلة → يفتح Issue تلقائياً
- عند إصلاحها → ينشئ PR
- لا تدخل بشري مطلوب
