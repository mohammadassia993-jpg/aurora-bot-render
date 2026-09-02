import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

const envFile = path.join(root, '.env');
const envLines = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').split(/\r?\n/) : [];

for (const line of envLines) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
}

export const config = {
  root,
  platformRole: process.env.PLATFORM_ROLE || 'primary',
  databaseSyncToken: process.env.DATABASE_SYNC_TOKEN || '',
  port: Number(process.env.PORT || 8787),
  gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789',
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  telegramWebhookSyncDisabled: process.env.TELEGRAM_WEBHOOK_SYNC_DISABLED === 'true',
  telegramProxyUrl: process.env.TELEGRAM_PROXY_URL || '',
  telegramChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || '',
  openRouterKey: process.env.OPENROUTER_API_KEY || '',
  geminiKey: process.env.GEMINI_API_KEY || '',
  autoRunConnectors: process.env.AUTO_RUN_CONNECTORS === 'true',
  contractApprovalRequired: process.env.CONTRACT_APPROVAL_REQUIRED !== 'false',
  dailyReportHour: Number(process.env.DAILY_REPORT_HOUR || 8),
  deworkToken: process.env.DEWORK_API_TOKEN || '',
  titanUrl: process.env.TITAN_API_URL || '',
  titanToken: process.env.TITAN_API_TOKEN || '',
  jobFeedUrl: process.env.JOB_FEED_URL || '',
  opportunityFeedUrl: process.env.OPPORTUNITY_FEED_URL || '',
  usdcAddress: process.env.USDC_RECEIVE_ADDRESS || '',
  usdtAddress: process.env.USDT_RECEIVE_ADDRESS || '',
  gptOssApiUrl: process.env.GPT_OSS_API_URL || '',
  siliconFlowKey: process.env.SILICONFLOW_API_KEY || '',
  siliconFlowModel: process.env.SILICONFLOW_MODEL || 'deepseek-chat',
  deepSeekKey: process.env.DEEPSEEK_API_KEY || '',
  deepSeekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  agnesKey: process.env.AGNES_API_KEY || '',
  agnesUrl: process.env.AGNES_API_URL || 'https://apihub.agnes-ai.com/v1',
  agnesModel: process.env.AGNES_MODEL || 'agnes-2.0-flash',
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:0.5b',



  gptOssModel: process.env.GPT_OSS_MODEL || 'gpt-oss-120b',
  aiPrimaryModel: process.env.AI_PRIMARY_MODEL || '',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  publicReadOnly: process.env.PUBLIC_READ_ONLY === 'true',
  teamUiToken: process.env.TEAM_UI_TOKEN || '',
  telegramFailover: process.env.TELEGRAM_FAILOVER !== 'false',
  backupUrl: process.env.AURORA_BACKUP_URL || '',
  cloudflaredToken: process.env.CLOUDFLARED_TUNNEL_TOKEN || '',
  officialEmail: process.env.OFFICIAL_EMAIL || 'auroraalmada4@gmail.com',
  backupEmail: process.env.BACKUP_EMAIL || 'Mohammadassia993@gmail.com',
  usdtTonAddress: process.env.USDT_TON_RECEIVE_ADDRESS || '',
  usdcBaseAddress: process.env.USDC_BASE_RECEIVE_ADDRESS || '',
  usdcSolanaAddress: process.env.USDC_SOLANA_RECEIVE_ADDRESS || '',
  hfToken: process.env.HF_TOKEN || '',
  hfUsername: process.env.HF_USERNAME || '',
  hfSpaceName: process.env.HF_SPACE_NAME || 'aurora-silent-giants-backup',
  superteamPassword: process.env.SUPERTEAM_PASSWORD || '',
  superteamEmail: process.env.SUPERTEAM_EMAIL || '',
  superteamApiKey: process.env.SUPERTEAM_API_KEY || '',
  superteamAgentId: process.env.SUPERTEAM_AGENT_ID || '',
  superteamClaimCode: process.env.SUPERTEAM_CLAIM_CODE || '',
  mailDeliveryMode: process.env.MAIL_DELIVERY_MODE || 'queue',
  backupMirrorDir: process.env.BACKUP_MIRROR_DIR || '',
  backupIntervalMinutes: Number(process.env.BACKUP_INTERVAL_MINUTES || 360),
  mailQueueIntervalMinutes: Number(process.env.MAIL_QUEUE_INTERVAL_MINUTES || 5),
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  baseRpcUrl: process.env.BASE_RPC_URL || 'https://base.blockscout.com/api/v2',
      solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      tonApiUrl: process.env.TON_API_URL || 'https://toncenter.com/api/v3',
      walletPollMinutes: Number(process.env.WALLET_POLL_MINUTES || 5),
      retryDelaysMs: (process.env.RETRY_DELAYS_MS || '5000,15000,60000').split(',').map(value => Number(value))
};
