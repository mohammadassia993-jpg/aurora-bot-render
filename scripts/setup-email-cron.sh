#!/bin/bash
# Setup email monitoring cron via cron-job.org
# Run this once to register the cron job

echo "Setting up email monitoring cron (every 2 hours)..."

# Cron-job.org API (free tier)
# Register at https://cron-job.org and get API key
# Then set CRON_API_KEY environment variable

if [ -z "$CRON_API_KEY" ]; then
  echo "⚠️ CRON_API_KEY not set. Manual setup required:"
  echo ""
  echo "1. Go to https://cron-job.org"
  echo "2. Create account (free)"
  echo "3. Add new cron job:"
  echo "   - URL: https://aurora-bot-render.onrender.com/email-check"
  echo "   - Method: POST"
  echo "   - Schedule: Every 2 hours"
  echo "4. Save and activate"
  echo ""
  echo "Alternative: Use Render Cron Jobs (if available on your plan)"
  echo "Or: Use GitHub Actions for cron scheduling"
  exit 0
fi

# API call to cron-job.org
curl -X POST "https://api.cron-job.org/v1/jobs" \
  -H "Authorization: Bearer $CRON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "job": {
      "url": "https://aurora-bot-render.onrender.com/email-check",
      "requestMethod": 1,
      "schedule": {
        "timezoneId": "UTC",
        "expiresAt": 0,
        "everyN": 2,
        "everyNType": 2
      },
      "enabled": true,
      "saveRawBody": true
    }
  }' | python3 -m json.tool

echo ""
echo "✅ Cron job created! Email will be checked every 2 hours."
