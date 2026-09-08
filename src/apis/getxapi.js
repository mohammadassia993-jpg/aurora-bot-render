/**
 * getxapi.js — Twitter/X posting via GetXAPI
 * Docs: https://getxapi.com/docs
 */
import { info, warn } from '../logger.js';

const API_KEY = process.env.GETXAPI_KEY || '';
const BASE = 'https://api.getxapi.com/v1';

export async function postTweet(text) {
  if (!API_KEY) { warn('getxapi', 'No GETXAPI_KEY configured'); return { success: false, error: 'no_key' }; }
  try {
    const res = await fetch(BASE + '/tweet', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json();
    info('getxapi', 'Tweet posted: ' + (data.id || 'unknown'));
    return { success: true, tweetId: data.id, url: 'https://x.com/i/status/' + data.id };
  } catch (e) { warn('getxapi', 'Post failed: ' + e.message); return { success: false, error: e.message }; }
}

export async function searchTweets(query) {
  if (!API_KEY) return [];
  try {
    const res = await fetch(BASE + '/search?q=' + encodeURIComponent(query) + '&count=10', {
      headers: { 'Authorization': 'Bearer ' + API_KEY },
      signal: AbortSignal.timeout(15000)
    });
    return (await res.json()).data || [];
  } catch { return []; }
}

export default { postTweet, searchTweets };
