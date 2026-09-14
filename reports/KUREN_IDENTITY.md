# KUREN_IDENTITY.md — Kuren Identity Platform

**التاريخ:** 2026-09-14
**الحالة:** ✅ مثبت لكن DNS error (server غير reachable من هذه الشبكة)

## النتائج:
- **الإصدار:** kuren v0.1.0 ✅
- **التثبيت:** Rust 1.98.1 → cargo install kuren → ناجح ✅
- **الbinary:** /usr/local/bin/kuren ✅

## اختبار Kuren:
```bash
kuren --help
# Kuren - Identity & Communication Platform
# Commands: auth, profile, connect, msg, notes, email, org, docs, update, listen
```

## محاولة التسجيل:
```bash
kuren auth signup silentgiants
# Generating Ed25519 keypair...
# Registering @silentgiants with server...
# Error: Failed to connect to server at https://kya.kuren.ai
# dns error: failed to lookup address information
```

## السبب:
- Kuren يتطلب الاتصال بخادمه على `kya.kuren.ai`
- DNS lookup يفشل من هذه البيئة (قد يكون geo-blocked أو DNS issue)
- الحل: تشغيل Kuren على جهاز آخر (Termux على الهاتف مثلاً) حيث DNS يعمل

## الميزة:
- مبنى على Ed25519 keypairs (بدون كلمات مرور)
- يوفر: بريد، رسائل، اتصالات اجتماعية
- مفتوح المصدر (cargo install kuren)
