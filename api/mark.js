import { RECITATION } from '../science-kb.js';
import { MISCONCEPTIONS } from '../misconceptions.js';
import { SYSTEM, buildUser } from '../marking-prompt.js';

function flat() {
  const out = [];
  RECITATION.forEach(ch => (ch.items || []).forEach(it => {
    if (it.q && it.a) out.push({ ...it, level: ch.level, chapter: ch.title });
  }));
  return out;
}

function extractJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { questionIndex, answer, attempt = 1, firstAnswer = '', revealAnswer = false } = req.body || {};
  const items = flat();
  const item = items[questionIndex];
  if (!item) return res.status(400).json({ error: 'Unknown question' });
  if (!String(answer || '').trim()) return res.status(400).json({ error: 'No answer supplied' });

  const mcList = MISCONCEPTIONS.map(m => m.id + ': ' + m.belief).join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1400,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildUser(item, answer, attempt, firstAnswer, mcList) }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: 'Model call failed', detail: detail.slice(0, 400) });
    }

    const data = await r.json();
    const parsed = extractJson(data.content?.[0]?.text);
    if (!parsed) return res.status(502).json({ error: 'Reply was not readable JSON' });

    // Look up the misconception server-side so the browser gets prose, not an id.
    if (parsed.misconceptionId) {
      const mc = MISCONCEPTIONS.find(m => m.id === parsed.misconceptionId);
      if (mc) parsed.misconception = { belief: mc.belief, fix: mc.fix };
      delete parsed.misconceptionId;
    }

    // The model answer is released only after attempt 2, or on an explicit
    // request — which is recorded, so a tutor can see who looked before trying.
    if (attempt >= 2 || revealAnswer) {
      parsed.modelAnswer = item.a;
      parsed.markingPoints = item.k || [];
      parsed.answerRequestedEarly = revealAnswer && attempt < 2;
    }

    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Unknown error' });
  }
}
