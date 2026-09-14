# BROWSER_MCP_SETUP.md — تثبيت Browser MCP (Agent360)

**التاريخ:** 2026-09-14
**الحالة:** ✅ مثبت ومُهيّأ (يتطلب Chrome على الجهاز)

## النتائج:
- **الحزمة:** `@agent360/browser-mcp` v1.29.1
- **التثبيت:** ناجح ✅
- **عدد الأدوات:** 40 أداة
- **الوصف:** Browser MCP - control your real, logged-in Chrome

## الإثبات:
```bash
npx @agent360/browser-mcp --help
# Browser MCP by Agent360 - control your real Chrome from Claude Code
# Usage:
#   npx @agent360/browser-mcp install    Extension files + register the server
#   npx @agent360/browser-mcp            Start MCP server
```

## الأدوات المتاحة (40):
- تحميل ملحق Chrome من Chrome Web Store
- فتح متصفح Chrome
- الانتقال إلى أي موقع
- التقاط لقطات شاشة
- التحكم بال TABs
- إجراء نقرات وحقول إدخال
- اختبار تطبيقات مصادق عليها
- قراءة أكواد 2FA من Gmail
- التخطي خلف تسجيل الدخول

## الحالة الفعلية:
- **مثبت:** ✅ على هذا السيرفر
- **يحتاج Chrome:** ⚠️ يحتاج Chrome على الجهاز الفعلي للتحكم
- **مفيد لـ:** سيناريوهات الاختبار الذاتية وال metavarification

## الكونفيغ المطلوب في MCP client:
```json
{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": ["@agent360/browser-mcp@latest"]
    }
  }
}
```
