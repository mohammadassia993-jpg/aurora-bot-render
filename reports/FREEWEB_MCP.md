# FREEWEB_MCP — freeweb-mcp HTTP MCP Server

**التاريخ:** 2026-09-13 | **المهمة:** 2.1

## ما تم تنفيذه
1. **فحص الحزمة:** freeweb-mcp v3.4.0 موجودة على npm ✅
2. **فحص الملفات:** dist/tools.js يصدّر `registerTools(server)` ✅
3. **إنشاء HTTP Wrapper:** `src/mcp-freeweb.js` — يحوّل Stdio → StreamableHTTP ✅
4. **دمج في الخدمة الحالية:** مسار `/mcp/freeweb` مضاف إلى `src/server.js` ✅
5. **رفع التبعيات:** `freeweb-mcp` + `@modelcontextprotocol/sdk` مضافان إلى `package.json` ✅

## الكود المضاف
```js
// src/mcp-freeweb.js — freeweb-mcp embedded HTTP endpoint
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
export async function handleFreewebMCP(request, response, rawBody) {
  const { registerTools } = await import('freeweb-mcp/dist/tools.js');
  const server = new McpServer({ name: 'freeweb', version: '3.4.0' });
  registerTools(server);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(request, response, body);
}
```

## كيفية الاستخدام
- POST `/mcp/freeweb` مع JSON-RPC request (MCP protocol)
- GET `/mcp/freeweb` — معلومات عن الخدمة
- لا يحتاج مفاتيح API — البحث عبر jsdom + playwright

## المستودع المستقل (备用)
- `github.com/mohammadassia993-jpg/aurora-freeweb-mcp` — جاهز للنشر كخدمة Render منفصلة عند توفر الدفع.

## المخرَج
✅ مدمج في الخدمة الحالية + مستودع مستقل جاهز.
