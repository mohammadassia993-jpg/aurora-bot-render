#!/bin/bash
REPO="/root/silent-giants"
STATE="$REPO/state/TEAM_STATE.md"
LOG="$REPO/data/weekly-report.log"

log() { echo "[$(date -Iseconds)] $1" >> "$LOG"; }

# Generate report
REPORT_TEXT="📊 التقرير الأسبوعي - $(date +%Y-%m-%d)

━━━━━━━━━━━━━━━━━━━━━━

🖥️ حالة النظام:
• البوت: يعمل على المنفذ 8788
• Telegram: نشط
• الذكاء: ردود عربية ذكية
• Watchdog: يراقب كل دقيقتين
• المزامنة: كل 5 دقائق إلى GitHub

📋 الإنجازات هذا الأسبوع:
• إصلاح [object Promise]
• تفعيل الردود الذكية بالعربية
• إضافة Gemini API key
• بناء نظام الحالة المركزية
• إنشاء آلية المزامنة التلقائية

🔗 الروابط:
• اللوحة: http://127.0.0.1:8788
• GitHub: mohammadassia993-jpg/aurora-bot-render
• الحالة: state/TEAM_STATE.md

📌 الخطوة التالية:
• تفعيل Render في بداية الشهر القادم

━━━━━━━━━━━━━━━━━━━━━━"

log "Weekly report generated"
REPORT "$REPORT_TEXT"
