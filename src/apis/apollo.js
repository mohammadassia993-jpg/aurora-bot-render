/**
 * apollo.js — Lead finding via Apollo.io
 */
import { info, warn } from '../logger.js';
const KEY = process.env.APOLLO_API_KEY || '';
const BASE = 'https://api.apollo.io/v1';

export async function searchLeads(query, limit = 10) {
  if (!KEY) { warn('apollo', 'No APOLLO_API_KEY'); return []; }
  try {
    const res = await fetch(BASE + '/mixed_people/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ api_key: KEY, q_keywords: query, per_page: limit, person_titles: ['CEO', 'CTO', 'Marketing Manager', 'Content Manager'] }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json();
    return (data.people || []).map(p => ({
      name: p.name, title: p.title, email: p.email, company: p.organization?.name, linkedin: p.linkedin_url
    }));
  } catch { return []; }
}

export default { searchLeads };
