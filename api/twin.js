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
      // Concept vocabulary is SUPPOSED to be shared — a twin tests the same idea.
      // Only a copied phrase counts as reuse, so compare 4-word runs, not single words.
      const norm = x => String(x || '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
      const runs = (x, n) => { const w = norm(x).split(' '); const out = [];
        for (let j = 0; j + n <= w.length; j++) out.push(w.slice(j, j + n).join(' ')); return out; };
      const stemRuns = new Set(runs(t.stem, 4));
      const copiedPhrases = runs(scheme.q, 4).filter(r => stemRuns.has(r));

      t.gate = {
        reusedSourceWording: copiedPhrases.length > 0,
        copiedPhrase: copiedPhrases[0] || null,
        ceclComplete: !!(t.cecl && t.cecl.choice && t.cecl.evidence && t.cecl.concept && t.cecl.link),
        // Evidence must name this twin's own situation, not the source's.
        evidenceIsSpecific: (() => {
          const ev = norm(t.cecl && t.cecl.evidence);
          const objWords = norm(t.object).split(' ').filter(w => w.length > 3);
          return objWords.length ? objWords.some(w => ev.includes(w)) : !!ev;
        })(),
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
