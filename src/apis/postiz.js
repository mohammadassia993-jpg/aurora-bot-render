/**
 * postiz.js — Multi-platform posting via Postiz
 */
import { info, warn } from '../logger.js';
const BASE = process.env.POSTIZ_API_URL || 'https://postiz.onrender.com/api';
const KEY = process.env.POSTIZ_API_KEY || '';

export async function postToPlatform(text, platform) {
  if (!KEY) { warn('postiz', 'No POSTIZ_API_KEY'); return { success: false, error: 'no_key' }; }
  try {
    const res = await fetch(BASE + '/posts', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: [{ type: 'text', text }], platforms: [platform] }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json();
    info('postiz', 'Posted to ' + platform + ': ' + data.id);
    return { success: true, postId: data.id };
  } catch (e) { return { success: false, error: e.message }; }
}

export async function postToAll(text) {
  const platforms = ['twitter', 'linkedin', 'reddit', 'facebook', 'instagram'];
  const results = {};
  for (const p of platforms) {
    results[p] = await postToPlatform(text, p);
  }
  return results;
}

export default { postToPlatform, postToAll };
