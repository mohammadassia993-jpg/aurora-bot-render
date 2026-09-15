# ADVISORIES_BLOCKED.md — حجب GitHub Advisories نهائياً
**التاريخ:** 2026-09-15

## القاعدة الجديدة
أي فرصة تحتوي على أي من النمطين التالين → مرفوضة تلقائياً:
- `CVE-` → مرفوض
- `GHSA-` → مرفوض
- `fixed in` → مرفوض
- `patched` → مرفوض
- `advisory` مع `severity: critical` + `patched_versions` → مرفوض

## السبب
- GitHub Advisories = ثغرات مُبلَّغ عنها ومُصلَحة
- لا مكافآت عليها (المسؤولية المسؤولة تتم عبر GitHub Security)
- الوقت المُضيئ في تحليلها = ضياع وقت

## الاستثناء الوحيد
- ثغرة GitHub Advisory **بدون** CVE/GHSA (نادرة جداً)
- في حال عُثر عليها → تُفحص يدوياً أولاً

## الملفات المُ受影响ة
- reports/GITHUB_ADVISORIES_DEEP.md → أصبح تاريخي فقط
- reports/IMMUNEFI_DEEP.md → عناصر CVE محذوفة
