# IDENTITY_LAYER.md — طبقة الهوية (Kuren / aura-x402)

**التاريخ:** 2026-09-14
**الحالة:** ⚠️ جزئي — Kuren غير متاح، aura-x402 يحتاج محفظة إلكترونية

## 1️⃣ Kuren (Rust crate):
- **الحالة:** ❌ غير متاح
- **السبب:** `cargo install kuren` — `cargo` غير مثبت في هذه البيئة
- **crates.io:** لم يتم العثور على crate باسم "kuren" (API أعاد فارغ)
- **البديل:** ثبّت Rust ثم `cargo install kuren` إذا كان موجوداً فعلاً

## 2️⃣ aura-x402 (Python package):
- **الحالة:** ⚠️ مثبت لكن يحتاج محفظة إلكترونية (Ethereum signer)
- **الإصدار:** v0.1.0 (PyPI)
- **التثبيت:** ناجح ✅
- **المشكلة:** `Aura.claim()` يتطلب `signer` مع `.address` attribute (محفظة ETH)
- **الأدوات المتاحة:** claim, whoami, inbox, read_mail, await_email_code, remember, recall
- **الalsa�ح:** يحتاج إنشاء محفظة Ethereum (eth_account) ثم استخدامها كـ signer

## الخلاصة:
- Kuren: غير مثبت (لا يوجد Rust)
- aura-x402: مثبت لكنه نظام هوية مبني على Ethereum — يحتاج محفظة رقمية
