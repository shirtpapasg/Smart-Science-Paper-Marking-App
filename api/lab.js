import { LABS } from '../labs-p4.js';
import { MISCONCEPTIONS } from '../misconceptions.js';
import { SYSTEM, buildUserFromScheme } from '../marking-prompt.js';
import { callModel, guard } from './_shared.js';

// The experiment library, members only. Three actions:
//   list  every activity, with its tags and whether it is ready
//   get   one activity — steps and questions only. Model answers and marking
//         points stay here and reach the pupil only through "mark", after a
//         real attempt: the same rule as everywhere else in the app.
//   mark  a written "explain" step or end-of-activity check, marked with the
//         same marker, the same rules and the same two-attempt flow as the
//         Answer tab. (One route for all three keeps the function count down.)
function marksOf(points) { return (points || []).reduce((s, p) => s + (+p.marks || 0), 0); }

function stripped(rec) {
  const out = { ...rec };
  if (rec.parts) out.parts = rec.parts.map(p => ({
    ...p,
    steps: (p.steps || []).map(s => s.explain ? { explain: { q: s.explain.q, marks: marksOf(s.explain.points) } } : s),
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
        kind: r.kind || 'lab3d', status: r.status || (r.parts ? 'ready' : 'soon'), sim: !!r.sim,
        cc21: r.cc21 || [], skills: r.skills || [], badge: r.badge || null });
    });
    return res.status(200).json({ level: 'P4', chapters });
  }

  const rec = LABS.find(r => r.id === String(id || ''));
  if (!rec) return res.status(404).json({ error: 'No such activity' });

  if (action === 'get') return res.status(200).json({ activity: stripped(rec) });

  if (action === 'mark') {
    const { part, step, check, answer, attempt = 1, firstAnswer = '' } = req.body || {};
    if (!String(answer || '').trim()) return res.status(400).json({ error: 'No answer supplied' });
    let target = null, q = '';
    if (check != null) { const c = (rec.check || [])[+check]; if (c) { target = c; q = c.q; } }
    else { const p = (rec.parts || []).find(x => x.id === String(part || '')); const s = p && (p.steps || [])[+step]; if (s && s.explain) { target = s.explain; q = s.explain.q; } }
    if (!target) return res.status(404).json({ error: 'No such question' });

    const scheme = {
      q, level: rec.level, topic: rec.chapter, questionType: 'explain',
      marks: target.marks || marksOf(target.points), concept: target.concept || '',
      markingPoints: target.points || [], modelAnswer: target.model || '',
      alsoAccept: target.alsoAccept || [], doNotAccept: target.doNotAccept || [],
    };
    const mcList = MISCONCEPTIONS.map(m => m.id + ': ' + m.belief).join('\n');
    try {
      const parsed = await callModel(SYSTEM, buildUserFromScheme(scheme, answer, attempt, firstAnswer, mcList), 1400);
      if (parsed.misconceptionId) {
        const mc = MISCONCEPTIONS.find(m => m.id === parsed.misconceptionId);
        if (mc) parsed.misconception = { belief: mc.belief, fix: mc.fix };
        delete parsed.misconceptionId;
      }
      if (attempt >= 2 && !parsed.deflect) {
        parsed.modelAnswer = scheme.modelAnswer;
        parsed.markingPoints = scheme.markingPoints.map(m => m.point);
      }
      return res.status(200).json(parsed);
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  }

  res.status(400).json({ error: 'Unknown action' });
}
