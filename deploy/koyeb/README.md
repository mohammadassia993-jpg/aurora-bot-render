# Koyeb deployment package

القائد اعتمد نقل التشغيل الأساسي إلى Koyeb. الحزمة التقنية جاهزة، لكن التنفيذ الفعلي لم يتم لأن البيئة الحالية لا تحتوي توكن Koyeb أو مستودع Git مرتبطًا بصلاحيات دفع.

## 0. Preconditions
- توكن Koyeb أو جلسة نشر مصرح بها.
- مستودع Git قابل للدفع، أو رفع صورة الحزمة مباشرة.
- Telegram bot token, webhook secret, and team UI token.
- Optional SMTP, Dework, Titan, and AI credentials stored outside Git.
- The production files are `Dockerfile`, `Procfile`, `package.json`, `src/`, `public/`, and `SOUL.md`.

## 1. Prepare the approved source branch
From the synced workspace:

```bash
cd /root/Documents/Codex/2026-08-21/new-chat/silent-giants
git init
git add Dockerfile Procfile package.json src public SOUL.md deploy/koyeb/README.md
git commit -m "Prepare Silent Giants for Koyeb"
git remote add origin git@github.com:mohammadassia993-jpg/aurora-bot-render.git
git push -u origin main
```

Use an existing remote if one is already configured. Never commit `.env`, `data/`, `logs/`, or `dist/`.

## 2. Create the Koyeb service
1. Sign in to Koyeb.
2. Choose **Create Service** → **GitHub**.
3. Authorize GitHub only for the approved repository.
4. Select `mohammadassia993-jpg/aurora-bot-render`.
5. Select the reviewed branch, normally `main`.
6. Builder: **Dockerfile**.
7. Exposed port: **8787**.
8. Health check path: `/health`.
9. Instance: smallest available tier.
10. Region: nearest stable region.
11. Service name: `silent-giants-primary`.

## 3. Configure environment variables
Add all values as Koyeb encrypted environment variables:

Required:
- `PORT=8787`
- `TELEGRAM_BOT_TOKEN=<rotated token>`
- `TELEGRAM_WEBHOOK_SECRET=<strong secret>`
- `TEAM_UI_TOKEN=<strong dashboard key>`
- `AURORA_BACKUP_URL=https://aurora-bot-render.onrender.com`
- `OFFICIAL_EMAIL=auroraalmada4@gmail.com`
- `BACKUP_EMAIL=Mohammadassia993@gmail.com`
- `MAIL_DELIVERY_MODE=queue`

Optional until approved:
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`
- `SMTP_USER=auroraalmada4@gmail.com`
- `SMTP_PASS=<Google App Password>`
- `DEWORK_API_TOKEN=<token>`
- `TITAN_API_URL=<metrics endpoint>`
- `TITAN_API_TOKEN=<token>`
- `OPENROUTER_API_KEY=<key>` or `GEMINI_API_KEY=<key>`

Until real keys exist, leave them empty: Dework and Titan automatically use simulation mode, and mail stays in durable local/cloud queue mode.

## 4. Deploy and verify
1. Click **Deploy**.
2. Wait for build and instance health to become healthy.
3. Verify:
   ```bash
   curl -fsS https://<app>.koyeb.app/health
   curl -fsS https://<app>.koyeb.app/report
   ```
4. Save the assigned public URL, for example `https://silent-giants-primary.koyeb.app`.

## 5. Switch Telegram to Koyeb
Set the secure webhook:

```bash
curl -fsS --get "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  --data-urlencode "url=https://<app>.koyeb.app/telegram/webhook" \
  --data-urlencode "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  --data-urlencode 'allowed_updates=["message"]'
```

Verify:

```bash
curl -fsS "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

## 6. Promote Koyeb safely
After verification:
- Set `PUBLIC_BASE_URL=https://<app>.koyeb.app` on Koyeb.
- Keep Render as backup.
- Stop the phone-only Pinggy tunnel only after Koyeb passes 24 hours of successful checks.
- Preserve SQLite data or attach managed storage before treating Koyeb as stateful primary.

## 7. Rollback
If `/health` fails or Telegram stops responding:
1. Redeploy the previous Koyeb revision, or pause the new service.
2. Reset the Telegram webhook to the last known-good Pinggy URL.
3. Keep Render available at `https://aurora-bot-render.onrender.com`.
