import { LABS } from '../labs-p4.js';
import { MISCONCEPTIONS } from '../misconceptions.js';
import { SYSTEM, buildUserFromScheme } from '../marking-prompt.js';
import { callModel, guard } from './_shared.js';

// Marks a written answer inside an experiment — an "explain" step or an
// end-of-activity check — against the scheme held server-side for it. Same
// marker, same rules, same two-attempt flow as the Answer tab: the full answer
// appears after the second attempt and never on request.
function marksOf(points) { return (points || []).reduce((s, p) => s + (+p.marks || 0), 0); }

export default async function handler(req, res) {
  if (!(await guard(req, res))) return;
  const { id, part, step, check, answer, attempt = 1, firstAnswer = '' } = req.body || {};
  if (!String(answer || '').trim()) return res.status(400).json({ error: 'No answer supplied' });

  const rec = LABS.find(r => r.id === String(id || ''));
  if (!rec) return res.status(404).json({ error: 'No such activity' });

  let target = null, q = '';
  if (check != null) {
    const c = (rec.check || [])[+check];
    if (c) { target = c; q = c.q; }
  } else {
    const p = (rec.parts || []).find(x => x.id === String(part || ''));
    const s = p && (p.steps || [])[+step];
    if (s && s.explain) { target = s.explain; q = s.explain.q; }
  }
  if (!target) return res.status(404).json({ error: 'No such question' });

  const scheme = {
    q, level: rec.level, topic: rec.chapter, questionType: 'explain',
    marks: target.marks || marksOf(target.points),
    concept: target.concept || '',
    markingPoints: target.points || [],
    modelAnswer: target.model || '',
    alsoAccept: target.alsoAccept || [],
    doNotAccept: target.doNotAccept || [],
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
    res.status(200).json(parsed);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
