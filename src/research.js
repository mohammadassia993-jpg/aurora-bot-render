import { db } from './db.js';
import { callModel } from './ai.js';
import { notify } from './notifications.js';
import { audit } from './audit.js';

function parseJson(value, fallback) {
  try {
    return JSON.parse(value.replace(/```json|```/g, '').trim());
  } catch {
    return fallback;
  }
}

function upsertOpportunity(title, source, payload) {
  db.prepare(`
    INSERT INTO tasks(source,external_id,title,reward,currency,fit_score,risk,payload_json)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(external_id) DO UPDATE SET title=excluded.title,payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP
  `).run(source, `research:${Buffer.from(title).toString('base64url').slice(0, 80)}`, title, payload.reward || 0, 'USD', payload.fit_score || 75, payload.risk || 'low', JSON.stringify(payload));
}

export async function runWeeklyResearch() {
  const cycle = new Date().toISOString().slice(0, 10);
  const prompt = `
You are Aurora Scout. Research current Web3 income opportunities.
Return strict JSON:
{"opportunities":[{"title":"","source":"","reward":0,"fit_score":80,"risk":"low","why":""}],
 "competitors":[{"name":"","strength":"","strategy":""}],
 "weekly_feedback":{"strengths":[],"weaknesses":[],"improvements":[]}}
Focus on Dework, Superteam Earn, BountyCaster, grants, ambassador programs, paid testnets, Web3 jobs, and DePIN.
`.trim();
  const summary = await callModel('scout', prompt);
  const parsed = parseJson(summary, { opportunities: [], competitors: [], weekly_feedback: { strengths: [], weaknesses: [], improvements: [] } });
  parsed.opportunities?.forEach(item => upsertOpportunity(item.title || 'Web3 opportunity', item.source || 'opportunity', item));

  db.prepare(`
    INSERT INTO research_reports(cycle,summary,opportunities_json,competitors_json)
    VALUES (?,?,?,?)
    ON CONFLICT(cycle) DO UPDATE SET summary=excluded.summary,
      opportunities_json=excluded.opportunities_json,
      competitors_json=excluded.competitors_json
  `).run(cycle, summary, JSON.stringify(parsed.opportunities || []), JSON.stringify(parsed.competitors || []));
  await notify('weekly_research', `تقرير بحث أسبوعي — ${cycle}`, `فرص جديدة: ${(parsed.opportunities || []).length}؛ تحليل منافسين: ${(parsed.competitors || []).length}`);
  audit('aurora', 'weekly_research_completed', { cycle });
  return { cycle, ...parsed };
}
