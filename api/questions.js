import { RECITATION } from '../science-kb.js';

// Returns questions ONLY — no model answers, no keywords. The mark scheme
// stays server-side, which is the same principle as marks being tutor-only.
export default function handler(req, res) {
  const out = [];
  RECITATION.forEach(ch => (ch.items || []).forEach(it => {
    if (it.q && it.a) out.push({ i: out.length, level: ch.level, chapter: ch.title, q: it.q });
  }));
  res.setHeader('cache-control', 's-maxage=86400');
  res.status(200).json({ questions: out });
}
