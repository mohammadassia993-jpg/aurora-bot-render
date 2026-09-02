#!/bin/bash
# ============================================================
# Silent Giants — Migration to Oracle Cloud Always Free (VPS)
# الهدف: تشغيل المنظومة 24/7 دون انقطاع على خادم دائم
# المتطلبات: حساب Oracle Cloud + بطاقة (تحقق فقط، لن تُخصم)
# ============================================================
set -euo pipefail

APP_DIR="$HOME/silent-giants"
REPO_URL="https://github.com/mohammadassia993-jpg/aurora-bot-render"
NODE_MAJOR=22
LOG_FILE="/tmp/oracle-migrate.log"

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG_FILE"; }

echo "════════════════════════════════════════════"
echo " Silent Giants → Oracle Cloud Migration"
echo "════════════════════════════════════════════"

# ---------- 0. إرشادات إنشاء الخادم في Oracle ----------
log "الخطوة 0: إنشاء الخادم يدوياً في واجهة Oracle Cloud"
log " 1) سجّل الدخول إلى https://cloud.oracle.com"
log " 2) Compute > Instances > Create Instance"
log " 3) المواصفات المطلوبة:"
log "    - Image: Ubuntu 22.04/24.04 (oracle-linux)"
log "    - Shape: VM.Standard.A1.Flex (Ampere ARM)"
log "    - OCPU: 2 | RAM: 12 GB"
log "    - Boot volume: 200 GB"
log "    - SSH: أضف مفتاحك العام"
log " 4) اضغط Create — الخادم جاهز خلال دقائق"

log ""
log "════════ مصادر النظام خارج نطاق هذا الخادم لهم"
log "أكمل تنفيذ الأوامر على الخادم السحابي الجديد:"

# ---------- 1. تحديث وتثبيت المتطلبات ----------
log "الخطوة 1: تحديث النظام وتثبيت المتطلبات"
apt-get update -y
apt-get install -y git curl build-essential python3 python3-venv termux-* 2>/dev/null || true

# ---------- 2. تثبيت Node.js 22 ----------
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 22 ]; then
  log "الخطوة 2: تثبيت Node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
log "Node version: $(node -v)"

# ---------- 3. استنساخ المشروع ----------
log "الخطوة 3: استنساخ المستودع"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR" 2>/dev/null || git -C "$APP_DIR" init
fi
cd "$APP_DIR"
git pull origin main 2>/dev/null || true

# ---------- 4. تثبيت التبعيات ----------
log "الخطوة 4: تثبيت التبعيات npm"
cd "$APP_DIR"
npm install --omit=dev || npm install

# ---------- 5. إعداد ملف البيئة ----------
log "الخطوة 5: إعداد ملف .env"
if [ ! -f .env ]; then
  cp .env.example .env 2>/dev/null || touch .env
  echo "⚠️ يجب إدخال المفاتيح في $APP_DIR/.env"
  echo "   (TELEGRAM_BOT_TOKEN, AGNES_API_KEY, SUPERTEAM_* ...)"
fi

# ---------- 6. تثبيت systemd service (تشغيل دائم 24/7) ----------
log "الخطوة 6: تثبيت خدمة systemd لتشغيل دائم"
cat > /etc/systemd/system/aurora.service << 'SVC_EOF'
[Unit]
Description=Silent Giants Aurora Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/silent-giants
Environment=NODE_OPTIONS=--experimental-modules
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
MemoryMax=6G

[Install]
WantedBy=multi-user.target
SVC_EOF

systemctl daemon-reload
systemctl enable aurora
systemctl start aurora

# ---------- 7. إعادة النشر على GitHub / Render ----------
log "الخطوة 7: تحديث الكود على GitHub"
cd "$APP_DIR"
git add -A
git commit -m "deploy: oracle cloud migration $(date +%F)" || true
git push origin main 2>/dev/null || true

# ---------- 8. التحقق النهائي ----------
log "الخطوة 8: التحقق من صحة النظام"
sleep 5
HEALTH=$(curl -s http://127.0.0.1:8788/health || echo "")
if echo "$HEALTH" | grep -q '"ok": true'; then
  log "✅ النظام يعمل على Oracle Cloud!" 
  log "$HEALTH"
else
  log "⚠️ النظام لم يبدأ بعد — راجع: journalctl -u aurora -f"
  journalctl -u aurora --no-pager -n 30
fi

log ""
log "════════════════════════════════════════════════"
log "🔗 البيانات للقائد:"
log "   - IP الخادم: <عنوان IP العام>"
log "   - المستخدم:  ubuntu  أو  opc  (حسب الصورة)"
log "   - SSH:  ssh -i /path/to/key ubuntu@<IP>"
log "   - الملف:   $APP_DIR/.env"
log "لوحة الصحة: http://<IP>:8788/health"
log "════════════════════════════════════════════════"
