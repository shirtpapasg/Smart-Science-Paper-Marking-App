import { RECITATION } from '../science-kb.js';
import { MISCONCEPTIONS } from '../misconceptions.js';
import { SYSTEM, buildUser, buildUserFromScheme } from '../marking-prompt.js';
import { callModel, guard } from './_shared.js';

function flat() {
  const out = [];
  RECITATION.forEach(ch => (ch.items || []).forEach(it => {
    if (it.q && it.a) out.push({ ...it, level: ch.level, chapter: ch.title });
  }));
  return out;
}

export default async function handler(req, res) {
  if (!guard(req, res)) return;

  const { questionIndex, scheme, answer, attempt = 1, firstAnswer = '', revealAnswer = false } = req.body || {};
  if (!String(answer || '').trim()) return res.status(400).json({ error: 'No answer supplied' });

  const mcList = MISCONCEPTIONS.map(m => m.id + ': ' + m.belief).join('\n');
  let user, modelAnswer = '', points = [];

  if (scheme && scheme.markingPoints) {
    // Any question, marked against a scheme derived for it.
    user = buildUserFromScheme(scheme, answer, attempt, firstAnswer, mcList);
    modelAnswer = scheme.modelAnswer || '';
    points = (scheme.markingPoints || []).map(m => m.point);
  } else {
    // A question from the answer guide.
    const item = flat()[questionIndex];
    if (!item) return res.status(400).json({ error: 'Unknown question' });
    user = buildUser(item, answer, attempt, firstAnswer, mcList);
    modelAnswer = item.a;
    points = item.k || [];
  }

  try {
    const parsed = await callModel(SYSTEM, user, 1400);

    if (parsed.misconceptionId) {
      const mc = MISCONCEPTIONS.find(m => m.id === parsed.misconceptionId);
      if (mc) parsed.misconception = { belief: mc.belief, fix: mc.fix };
      delete parsed.misconceptionId;
    }

    // A deflected input is a plea, an off-topic message or rude words — never an
    // attempt. It must not unlock the answer, whatever the attempt number says.
    if ((attempt >= 2 || revealAnswer) && !parsed.deflect) {
      parsed.modelAnswer = modelAnswer;
      parsed.markingPoints = points;
      parsed.answerRequestedEarly = revealAnswer && attempt < 2;
    }

    res.status(200).json(parsed);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
