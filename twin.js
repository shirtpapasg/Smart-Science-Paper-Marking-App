import { TWIN_SYSTEM, buildTwinUser } from '../marking-prompt.js';
import { syllabusContext, callModel } from './_shared.js';

// Generates extra practice from an approved scheme. Same concept, new situation,
// no wording from the source. The tutor still approves every one.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { scheme, avoid = [], count = 1 } = req.body || {};
  if (!scheme || !scheme.concept) return res.status(400).json({ error: 'No scheme supplied' });

  try {
    const { exclusions } = syllabusContext();
    const used = [...avoid];
    const out = [];
    for (let i = 0; i < Math.min(count, 3); i++) {
      const t = await callModel(TWIN_SYSTEM, buildTwinUser(scheme, exclusions, used), 1400);
      // Gate: reject anything that reuses the source wording or an excluded term.
      const stem = String(t.stem || '').toLowerCase();
      const srcWords = String(scheme.q || '').toLowerCase().match(/[a-z]{6,}/g) || [];
      const overlap = srcWords.filter(w => stem.includes(w)).length;
      t.gate = {
        reusedSourceWording: overlap > 3,
        ceclComplete: !!(t.cecl && t.cecl.choice && t.cecl.evidence && t.cecl.concept && t.cecl.link),
        evidenceIsSpecific: !!(t.cecl && t.object &&
          String(t.cecl.evidence || '').toLowerCase().split(/\s+/).some(w => String(t.object).toLowerCase().includes(w))),
      };
      t.concept = scheme.concept;
      t.level = scheme.level;
      t.topic = scheme.topic;
      t.questionType = scheme.questionType;
      out.push(t);
      if (t.object) used.push(t.object);
    }
    res.status(200).json({ twins: out });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
