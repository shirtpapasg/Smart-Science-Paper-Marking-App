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

// Front door for every API function. Sends the error response itself and
// returns false, or returns true so the handler can carry on.
const WINDOW_MS = 10 * 60 * 1000, MAX_HITS = 30, MAX_IPS = 500;
const CAPS = { questionText: 1500, question: 1500, answer: 800, pupilAnswer: 800, imageBase64: 8000000 };
const hits = new Map();   // ip -> [timestamps]

export function guard(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return false; }

  const allowed = process.env.ALLOWED_ORIGIN;
  if (allowed) {
    const ok = [req.headers.origin, req.headers.referer].some(h => h && String(h).startsWith(allowed));
    if (!ok) { res.status(403).json({ error: 'Not allowed' }); return false; }
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_HITS) {
    hits.set(ip, recent);
    res.status(429).json({ error: 'Too many requests. Wait a few minutes.' });
    return false;
  }
  recent.push(now);
  if (!hits.has(ip) && hits.size >= MAX_IPS) hits.delete(hits.keys().next().value);
  hits.set(ip, recent);

  const body = req.body || {};
  for (const [field, cap] of Object.entries(CAPS)) {
    if (body[field] != null && String(body[field]).length > cap) {
      res.status(400).json({ error: 'That is too long.' });
      return false;
    }
  }
  return true;
}
