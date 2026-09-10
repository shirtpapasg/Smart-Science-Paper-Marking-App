import { LABS } from '../labs-p4.js';
import { guard } from './_shared.js';

// The experiment library, members only. The browser gets the steps and the
// questions; model answers and marking points stay here and reach the pupil
// only through lab-mark, after a real attempt — the same rule as everywhere
// else in the app.
function marksOf(points) { return (points || []).reduce((s, p) => s + (+p.marks || 0), 0); }

function stripped(rec) {
  const out = { ...rec };
  if (rec.parts) out.parts = rec.parts.map(p => ({
    ...p,
    steps: (p.steps || []).map(s => s.explain
      ? { explain: { q: s.explain.q, marks: marksOf(s.explain.points) } }
      : s),
  }));
  if (rec.check) out.check = rec.check.map(c => ({ q: c.q, marks: c.marks || marksOf(c.points) }));
  return out;
}

export default async function handler(req, res) {
  if (!(await guard(req, res))) return;
  const { action, id } = req.body || {};

  if (action === 'list') {
    const chapters = [];
    LABS.forEach(r => {
      let ch = chapters.find(c => c.title === r.chapter);
      if (!ch) { ch = { n: chapters.length + 1, title: r.chapter, activities: [] }; chapters.push(ch); }
      ch.activities.push({ id: r.id, code: r.code, title: r.title, minutes: r.minutes || null,
        kind: r.kind || 'lab3d', status: r.status || (r.parts ? 'ready' : 'soon'), sim: !!r.sim });
    });
    return res.status(200).json({ level: 'P4', chapters });
  }

  if (action === 'get') {
    const rec = LABS.find(r => r.id === String(id || ''));
    if (!rec) return res.status(404).json({ error: 'No such activity' });
    return res.status(200).json({ activity: stripped(rec) });
  }

  res.status(400).json({ error: 'Unknown action' });
}
