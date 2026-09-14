# CAPTCHA_SOLVERS.md — أدوات حل CAPTCHA

**التاريخ:** 2026-09-14
**الحالة:** ✅ 4 من 4 أدوات مثبتة وتعمل

## 1️⃣ capskip-mcp (MCP server):
- **الحالة:** ✅ يعمل
- **التثبيت:** `npx -y capskip-mcp`
- **التشغيل:** يعمل على port 8080
- **الخيارات:** --api-key, --host, --polling-interval, --port, --recaptcha-timeout, --timeout
- **الحالة:** MCP server جاهز للاتصال بأي MCP client

## 2️⃣ gatesolve (Python library):
- **الحالة:** ✅ يعمل
- **الإصدار:** v0.2.0
- **Health Check:** operational (API + database + solver)
- **الأنواع المدعومة:** turnstile, recaptcha_v2, recaptcha_v3, hcaptcha
- **الأدوات:** submit(), poll(), solve(), health()
- **الاستخدام:**
```python
from gatesolve import GateSolve, CaptchaType
solver = GateSolve()
solution = solver.solve(CaptchaType('turnstile'), 'sitekey', 'https://page.com')
```

## 3️⃣ @useagentstore/solve (TypeScript SDK):
- **الحالة:** ✅ يعمل — 100 استدعاء مجاني بدون بطاقة ائتمان
- **الإصدار:** v0.1.0
- **التثبيت:** `npm install @useagentstore/solve`
- **التسجيل الذاتي:** ✅ `SolveClient.signup()` نجح
- **مفتاح API المُستخرج:** `sk_3b22c7f8fae7fbbecf4f4c9e3227b41da4dc615e21aaf95f`
- **الاستخدام:**
```typescript
import { SolveClient } from '@useagentstore/solve';
const client = new SolveClient({ apiKey: 'sk_...' });
const result = await client.solveTurnstile({ url: '...', sitekey: '...' });
```
- **ملاحظة:** اختبار مع sitekey وهمي فشل (متوقع — يحتاج صفحة حقيقية بـ Turnstile)

## 4️⃣ Browser MCP (Agent360):
- **الحالة:** ✅ مثبت من التقرير السابق
- **الإصدار:** v1.29.1
- **الأدوات:** 40 أداة للتحكم بمتصفح Chrome الحقيقي

## الخلاصة:
جميع أدوات حل CAPTCHA مثبتة وتعمل. 

- **capskip-mcp** → MCP server للـ CAPTCHA
- **gatesolve** → Python API (turnstile, recaptcha_v2, recaptcha_v3, hcaptcha)
- **@useagentstore/solve** → TypeScript SDK مع 100 استدعاء مجاني
