/**
 * gumroad.js — Product upload via Gumroad API
 */
import { info, warn } from '../logger.js';
const KEY = process.env.GUMROAD_API_KEY || '';
const BASE = 'https://api.gumroad.com/v2';

export async function createProduct({ name, price, description, url }) {
  if (!KEY) { warn('gumroad', 'No GUMROAD_API_KEY'); return { success: false, error: 'no_key' }; }
  try {
    const res = await fetch(BASE + '/products', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: { name, price: price * 100, description, preview_url: url } }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json();
    info('gumroad', 'Product created: ' + data.product?.name);
    return { success: true, productId: data.product?.id, url: data.product?.short_url };
  } catch (e) { return { success: false, error: e.message }; }
}

export default { createProduct };
