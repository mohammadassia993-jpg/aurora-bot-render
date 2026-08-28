# Aurora Gemini Relay — Cloudflare Worker

وسيط دائم ومجاني يعيد توجيه طلبات Gemini API من منطقة Cloudflare المدعومة، لحل الحظر الجغرافي من سوريا.

## النشر (خطوتان، مرة واحدة من القائد)

1. أنشئ حساباً مجانياً: https://dash.cloudflare.com/sign-up
2. في لوحة Cloudflare → القائمة الجانبية → **Workers & Pages** → **Create Worker** → **Paste code** → الصق محتوى `worker.js` → **Deploy**.
3. أضف المتغير: Workers → `aurora-gemini-relay` → Settings → Variables → + Add:
   - الاسم: `GEMINI_API_KEY`
   - القيمة: مفتاحك الصحيح الذي يبدأ بـ `AIza...`
4. أرسل رابط الـ Worker (مثل `https://aurora-gemini-relay.<sub>.workers.dev`) للفريق.

## الاستخدام من النظام المحلي

عند توفر مفتاح صحيح، يُحدَّث `.env`:
```
GEMINI_PROXY_URL=https://aurora-gemini-relay.<sub>.workers.dev
```
وسيستخدم النظام الوسيط تلقائياً بدل Google المباشر.
