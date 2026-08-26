// Keep-Alive script for Render free tier
// Pings the service every 14 minutes to prevent sleep
const RENDER_URL = process.env.RENDER_URL || 'https://aurora-bot-render.onrender.com';

async function ping() {
  try {
    const res = await fetch(`${RENDER_URL}/health`, { signal: AbortSignal.timeout(10000) });
    console.log(`[${new Date().toISOString()}] Ping: ${res.status} ${res.ok ? '✅' : '❌'}`);
  } catch (e) {
    console.log(`[${new Date().toISOString()}] Ping failed: ${e.message}`);
  }
}

// Run immediately, then every 14 minutes
ping();
setInterval(ping, 14 * 60 * 1000);
