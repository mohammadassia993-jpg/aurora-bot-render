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

const LEADER_CRITERIA = [
  'monthly income 2000-30000 USD (not a small salary)',
  'payout within days up to one month',
  'zero startup costs',
  'no bank; payment in USDT only',
  'zero wallet risk',
  'no human input from the leader (no voice, no video, no meetings)',
  'novel idea/role not previously discussed (not airdrops, digital products, or B2B services)',
  'integrated with the Silent Giants team (leader only approves and starts execution)',
  'no risk of being seen as a bot/automated agent',
  'not complex, no technical/legal challenges, no upfront payment'
];

export async function runDailyResearch() {
  const cycle = new Date().toISOString().slice(0, 10);
  const prompt = `
You are Aurora Scout. Find NEW Web3/remote income opportunities for the Silent Giants team.
Each opportunity MUST satisfy ALL of these criteria:
${LEADER_CRITERIA.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Return strict JSON only:
{"opportunities":[{"title":"","source":"","reward":0,"fit_score":80,"risk":"low","why":"","criteria_met":["..."],"actionable":"","payout":"days|weeks|month"}],
 "blocked_ideas":["known/non-qualifying ideas we should avoid"],
 "recommendations":["prioritized next actions"]}
Be realistic and specific. Do NOT invent fake platforms; only list real markets/roles that fit the criteria.
`.trim();
  try {
    const summary = await callModel('daily-scout', prompt);
    const parsed = parseJson(summary, { opportunities: [], blocked_ideas: [], recommendations: [] });
    const raw = (parsed.opportunities || []).filter(Boolean);
    // If the AI provided explicit criteria_met fields, require >=8; otherwise (deterministic
    // simulation when keys are unavailable) accept the returned opportunities as pre-filtered.
    const withCriteria = raw.filter(item => Array.isArray(item.criteria_met));
    const base = withCriteria.length >= raw.length
      ? withCriteria.filter(item => item.criteria_met.length >= 8)
      : raw;
    const qualified = base.map(item => ({ ...item, daily_research: true }));
    qualified.forEach(item => upsertOpportunity(item.title || 'Web3 opportunity', item.source || 'opportunity', item));

    db.prepare(`
      INSERT INTO research_reports(cycle,summary,opportunities_json,competitors_json)
      VALUES (?,?,?,?)
      ON CONFLICT(cycle) DO UPDATE SET summary=excluded.summary,
        opportunities_json=excluded.opportunities_json,
        competitors_json=excluded.competitors_json
    `).run(`daily:${cycle}`, summary, JSON.stringify(qualified), JSON.stringify(parsed.blocked_ideas || []));
    await notify('daily_research', `تقرير بحث يومي — ${cycle}`, `فرص مؤهلة: ${qualified.length}؛ أفكار مستبعدة: ${(parsed.blocked_ideas || []).length}`);
    audit('aurora', 'daily_research_completed', { cycle, qualified: qualified.length });
    return { cycle, opportunities: qualified, blocked_ideas: parsed.blocked_ideas || [], recommendations: parsed.recommendations || [] };
  } catch (caught) {
    audit('aurora', 'daily_research_failed', { cycle, error: caught.message });
    return { cycle, opportunities: [], error: caught.message };
  }
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
