import { TOPICS } from '../syllabus-p3p5.js';

export function syllabusContext() {
  const topics = TOPICS.map(t => t.levels.join('/') + ' · ' + t.theme + ' · ' + t.topic +
    (t.outcomes && t.outcomes.length ? ' — ' + t.outcomes.slice(0,3).join('; ') : '')).join('\n');
  const exclusions = TOPICS.flatMap(t => (t.excludes || []).map(e => t.topic + ': ' + e)).join('\n');
  return { topics, exclusions };
}

export function extractJson(text) {
  const t = String(text || '').trim().replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}

export async function callModel(system, user, maxTokens = 1600) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error('Model call failed: ' + (await r.text()).slice(0, 300));
  const data = await r.json();
  const parsed = extractJson(data.content?.[0]?.text);
  if (!parsed) throw new Error('The reply was not readable JSON');
  return parsed;
}
