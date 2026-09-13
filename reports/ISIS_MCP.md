# ISIS_MCP — isis-mcp HTTP MCP Server

**التاريخ:** 2026-09-13 | **المهمة:** 2.2

## ما تم فحصه
- الحزمة: isis-mcp v2.0.0 ✅
- الأدوات: rag, fetchFullContent, scrape, screenshot ✅
- الاعتماديات الثقيلية: better-sqlite3 (native), node-llama-cpp (100MB+), playwright ✅

## قرار عدم الدمج في الخدمة الحالية
isis-mcp تحتوي على `node-llama-cpp` و `better-sqlite3` — اعتماديات native تحتاج ترجمة وتنزيل ثقيل أثناء بناء Docker.
الدمج في aurora-bot-render (الخدمة الحية) قد يسبب فشل البناء أو ارتفاع استخدام الذاكرة.
**قرار: نشر كخدمة مستقلة فقط عند توفر الدفع.**

## المستودع الجاهز
- `github.com/mohammadassia993-jpg/aurora-isis-mcp` ✅
- يحتوي: Dockerfile + package.json + server.js (HTTP wrapper) ✅

## الإجراء عند توفر الدفع
```bash
POST /v1/services {
  "name": "aurora-isis-mcp",
  "type": "web_service",
  "repo": "https://github.com/mohammadassia993-jpg/aurora-isis-mcp"
}
```

## المخرَج
✅ مستودع جاهز + خطة نشر — معلق على الدفع فقط.
