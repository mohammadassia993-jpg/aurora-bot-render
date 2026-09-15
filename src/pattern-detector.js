/**
 * pattern-detector.js — محرك الأنماط (يمنع تكرار الأخطاء)
 * 
 *Leader Order 2026-09-15: بناء نظام تعلم من الأخطاء
 * 
 * Usage: import { detectPattern, getRule } from './pattern-detector.js';
 */

const MISTAKES = [
  {
    id: 1,
    pattern: /not\s*found|404|page\s+not\s+found/i,
    rule: "NOT_FOUND_RECOVERY",
    action: "ابحث في 6 منصات بديلة قبل الاستسلام",
    fallback: ["code4rena.com", "sherlock.xyz", "cantina.xyz", "hats.finance", "immunefi.com", "github.com"]
  },
  {
    id: 2,
    pattern: /api\s*(500|403|error|fail|timeout|rate.?limit)/i,
    rule: "PLAYWRIGHT_FIRST",
    action: "انتقل إلى Playwright فوراً — لا انتظار",
    fallback: ["playwright", "browser_automation"]
  },
  {
    id: 3,
    pattern: /cve-\d{4}-\d+|ghsa-[a-z0-9]{4}|fixed\s+in|patched|security\s+advisory/i,
    rule: "DEAD_BOUNTY_BLOCK",
    action: "ثغرة ميتة — تجاهلها تماماً",
    fallback: ["skip", "search_active_programs"]
  },
  {
    id: 4,
    pattern: /install|npm\s+i|pip\s+install|apt\s+install/i,
    rule: "INSTALL_WITH_PLAN",
    action: "تأكد من خطة الاستخدام خلال 10 دقائق",
    fallback: ["verify_plan", "check_usage"]
  },
  {
    id: 5,
    pattern: /1\.?\d*\s*s(ec)?|second|ثانية/i,
    rule: "REVIEWER_STANDARD",
    action: "تقييم شكلي — المراجع يجب أن يأخذ ≥ 15 ثانية",
    fallback: ["require_evidence", "demand_proof"]
  },
  {
    id: 6,
    pattern: /captcha|recaptcha|hcaptcha|turnstile/i,
    rule: "ONE_TOOL_ONLY",
    action: "استخدم أداة CAPTCHA واحدة فقط",
    fallback: ["2captcha", "capsolver"]
  },
  {
    id: 7,
    pattern: /template|قالب|بند|checklist|قائمة\s+جاهزة/i,
    rule: "EXECUTE_FIRST",
    action: "التنفيذ أولاً — لا قوالب بدل العمل",
    fallback: ["execute", "build", "deploy"]
  },
  {
    id: 8,
    pattern: /report|تقرير|تم\s+النجاح|أرسل\s+تقرير/i,
    rule: "TEST_BEFORE_REPORT",
    action: "اختبر قبل الإبلاغ — لا تقارير مبكرة",
    fallback: ["test", "verify", "confirm"]
  },
  {
    id: 9,
    pattern: /wait|انتظر|相待|قرار|confir/i,
    rule: "NO_WAITING",
    action: "لا انتظار — Playwright يحل كل شيء",
    fallback: ["playwright", "automate", "execute"]
  },
  {
    id: 10,
    pattern: /error|fail|فشل|timeout| crashed/i,
    rule: "AUTO_RETRY",
    action: "حوّل تلقائياً إلى المسار البديل",
    fallback: ["alternative_path", "retry_with_different_approach"]
  }
];

/**
 * Detect if a situation matches a known mistake pattern
 * @param {string} context - The situation text to analyze
 * @returns {{ matched: boolean, rule: string, action: string, fallback: string[] } | null}
 */
export function detectPattern(context) {
  const text = String(context || '').toLowerCase();
  
  for (const mistake of MISTAKES) {
    if (mistake.pattern.test(text)) {
      return {
        matched: true,
        mistakeId: mistake.id,
        rule: mistake.rule,
        action: mistake.action,
        fallback: mistake.fallback
      };
    }
  }
  
  return { matched: false };
}

/**
 * Get the rule for a specific pattern name
 * @param {string} ruleName - e.g. "NOT_FOUND_RECOVERY"
 * @returns {object | null}
 */
export function getRule(ruleName) {
  return MISTAKES.find(m => m.rule === ruleName) || null;
}

/**
 * Get all active rules
 * @returns {object[]}
 */
export function getAllRules() {
  return MISTAKES.map(m => ({
    id: m.id,
    rule: m.rule,
    action: m.action
  }));
}

/**
 * Check if an opportunity should be blocked
 * @param {object} opportunity - { title, description, url, source }
 * @returns {{ blocked: boolean, reason: string }}
 */
export function shouldBlock(opportunity) {
  const text = `${opportunity?.title || ''} ${opportunity?.description || ''} ${opportunity?.url || ''}`;
  
  // Check dead bounty
  const deadBounty = detectPattern(text);
  if (deadBounty.matched && deadBounty.rule === 'DEAD_BOUNTY_BLOCK') {
    return { blocked: true, reason: 'ثغرة ميتة (CVE/GHSA)' };
  }
  
  return { blocked: false, reason: '' };
}

export default { detectPattern, getRule, getAllRules, shouldBlock };
