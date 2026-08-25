import https from 'node:https';
import { SocksProxyAgent } from 'socks-proxy-agent';

const API_CANDIDATES = [
  process.env.TELEGRAM_API_HOST,
  'api.telegram.org',
  '149.154.167.99'
].filter(Boolean);

function requestOnce(token, hostname, apiMethod, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const options = {
      hostname,
      port: 443,
      path: `/bot${token}/${apiMethod}`,
      method: payload ? 'POST' : 'GET',
      servername: 'api.telegram.org',
      timeout: timeoutMs,
      headers: {
        accept: 'application/json',
        host: 'api.telegram.org',
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {})
      }
    };
    const proxyUrl = process.env.TELEGRAM_PROXY_URL || '';
    if (proxyUrl) options.agent = new SocksProxyAgent(proxyUrl);
    const request = https.request(options, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode, ok: response.statusCode >= 200 && response.statusCode < 300, data: JSON.parse(raw) });
        } catch (error) {
          reject(new Error(`TELEGRAM_INVALID_RESPONSE: ${error.message}`));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('TELEGRAM_TIMEOUT')));
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

export async function telegramRequest(token, apiMethod, body = null, timeoutMs = 15000) {
  if (!token) throw new Error('TELEGRAM_TOKEN_MISSING');
  let lastError;
  for (const hostname of API_CANDIDATES) {
    try {
      const result = await requestOnce(token, hostname, apiMethod, body, timeoutMs);
      if (result.ok || result.status < 500) return result;
      lastError = new Error(`TELEGRAM_HTTP_${result.status}`);
    } catch (caught) {
      lastError = caught;
    }
  }
  throw lastError || new Error('TELEGRAM_UNREACHABLE');
}

export async function telegramTokenHealth(token) {
  try {
    const response = await telegramRequest(token, 'getMe', null, 4500);
    return Boolean(response.ok && response.data?.ok);
  } catch {
    return false;
  }
}
