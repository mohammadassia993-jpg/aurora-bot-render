# طريقة جمع بيانات الشركات

## الدليل: DATA_COLLECTION_METHOD.md
## التاريخ: 12 سبتمبر 2026

---

### الطريقة المستخدمة: Web Scraping عبر Playwright

بما أن APIFY_TOKEN غير متوفر، واستخدمنا الطريقة التالية:

1. **الغرض**: جمع قاعدة بيانات لشركات Web3 نشطة في التوظيف
2. **المنصة**: web3.career (largest Web3 jobs board)
3. **الأداة**: Python + Playwright (headless Chromium)
4. **الفترة**: 5 صفحات من الرئيسية (129 شركة أصلية)

### الخطوات:
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('https://web3.career/')
    # Parse job listings for company names
    # Filter noise (job categories, salary pages, etc.)
    # Merge with curated list of 50+ known companies
```

### النتائج:
- 129 شركة من ال刮リング الأصلي
- 86 شركة بعد التنقية والدمج
- محفوظة في: data/web3-companies-100.json

### الأعمدة:
- `name`: اسم الشركة
- `email`: البريد الإلكتروني (إن وُجد)
- `type`: نوع الشركة (L1, L2, DeFi, etc.)
- `job_source`: المصدر (web3.career / known / curated)

### المتابعة:
- يُضاف grapevine scraper لجمع رسائل البريد
- يُستخدم ScraperAPI أو isis-mcp بدلاً من Playwright في الإصدار الجديد

---
فريق عمالقة الصمت
