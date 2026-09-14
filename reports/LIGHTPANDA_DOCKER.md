# LIGHTPANDA_DOCKER.md — Lightpanda عبر Docker

**التاريخ:** 2026-09-14
**الحالة:** ❌ Docker غير متوفر في هذه البيئة

## النتائج:
- **docker:** غير مثبت (`command not found`)
- **Image:** `lightpanda/browser:nightly` — موجود لكن لا يمكن سحبه

## السبب:
هذه البيئة (Codex sandbox) لا تحتوي على Docker daemon. Docker متاح فقط في بيئات：
- VPS (DigitalOcean, Linode, etc.)
- Local machine مع Docker Desktop
- CI/CD مع Docker support

## البديل المتاح:
- Lightpanda Session Bridge repo مُنسوخ (من الجلسة السابقة)
- `bridge.py` موجود لكن يحتاج Lightpanda binary
- يمكن تشغيله على VPS مجاني (Serv00, Kerit Cloud)

## للاكمال:
1. احصل على VPS (DigitalOcean $5/mo أو مجاني)
2. `docker pull lightpanda/browser:nightly`
3. `docker run -d --name lightpanda -p 127.0.0.1:9222:9222 lightpanda/browser:nightly`
4. اربطه بـ Playwright عبر CDP endpoint
