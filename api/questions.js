import { RECITATION } from '../science-kb.js';
import { guard } from './_shared.js';

// Returns questions ONLY — no model answers, no keywords. The mark scheme
// stays server-side, which is the same principle as marks being tutor-only.
// Members only, like everything else the app fetches.
export default async function handler(req, res) {
  if (!(await guard(req, res))) return;
  const out = [];
  RECITATION.forEach(ch => (ch.items || []).forEach(it => {
    if (it.q && it.a) out.push({ i: out.length, level: ch.level, chapter: ch.title, q: it.q });
  }));
  res.status(200).json({ questions: out });
}
