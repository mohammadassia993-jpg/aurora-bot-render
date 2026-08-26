# Render Deployment Guide - Silent Giants

## Setup (once at beginning of month)

### Step 1: Create New Service
1. Go to https://dashboard.render.com
2. Click "New Web Service"
3. Connect GitHub: mohammadassia993-jpg/aurora-bot-render
4. Select branch: main

### Step 2: Configuration
- Name: silent-giants-primary
- Region: Oregon (or closest)
- Instance: Free
- Build Command: npm ci --omit=dev
- Start Command: node src/index.js

### Step 3: Environment Variables
```
PORT=8787
TELEGRAM_BOT_TOKEN=8964456145:AAEcQ5AGdssnNbgMRW06b96PMiaXXvsWVdE
TELEGRAM_WEBHOOK_SECRET=b5rRBpEPisZmxMvw8gAtk-Wl21mgFEXkZkeNUj3lY8c
TEAM_UI_TOKEN=8cdQ7WY9SvAGxe6SfFPlngj0_UbX6vCr
GEMINI_API_KEY=AQ.Ab8RN6JlXIMGLeosMEaRoFRklGFobc9e8I2CTyb7SqQMis9FdA
AI_SIMULATION_MODE=false
TELEGRAM_FAILOVER=false
MAIL_DELIVERY_MODE=queue
OFFICIAL_EMAIL=auroraalmada4@gmail.com
BACKUP_EMAIL=Mohammadassia993@gmail.com
```

### Step 4: Deploy
1. Click "Create Web Service"
2. Wait for build to complete
3. Verify: https://aurora-bot-render.onrender.com/health

### Step 5: Set Telegram Webhook
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://aurora-bot-render.onrender.com/telegram/webhook&secret_token=<SECRET>"
```

### Step 6: Keep-Alive (prevents free tier sleep)
Set up on cron-job.org:
- URL: https://aurora-bot-render.onrender.com/health
- Interval: Every 14 minutes
