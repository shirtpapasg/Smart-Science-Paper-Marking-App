import { DERIVE_SYSTEM, buildDeriveUser, buildDerivePartsUser, MCQ_SYSTEM, buildMcqUser } from '../marking-prompt.js';
import { syllabusContext, callModel, guard } from './_shared.js';

// Writes a mark scheme for a question the answer guide has never seen.
// This is the step that lets the app mark ANY question, not just the 247.
//
// A question with parts (a), (b), (c) gets one scheme PER PART, all sharing a
// single stem. The stem is written once and never repeated inside a part —
// a part marked without its stem is marked blind, so the app keeps them together.
export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const { questionText, format, parts: readParts, stem: knownStem } = req.body || {};
  if (!String(questionText || '').trim()) return res.status(400).json({ error: 'No question supplied' });

  try {
    const { topics, exclusions } = syllabusContext();
    const mcq = format === 'mcq';

    // Sub-part labels as printed on the page: (a), (b) … Either the photo reader
    // found them, or the typed text shows more than one, or an earlier page has
    // already given us the stem and this page holds the remaining part(s).
    const labels = [...new Set((String(questionText).match(/(?:^|\s)\(([a-j])\)(?=\s|$)/g) || []).map(s => s.trim()))];
    const multi = !mcq && ((Array.isArray(readParts) && readParts.length > 1) || labels.length > 1 || !!knownStem);

    if (multi) {
      const out = await callModel(DERIVE_SYSTEM, buildDerivePartsUser(questionText, topics, exclusions, knownStem), 3600);
      if (Array.isArray(out.parts) && out.parts.length) {
        out.format = 'parts';
        if (knownStem && !out.stem) out.stem = knownStem;
        out.derivedAt = Date.now();
        return res.status(200).json(out);
      }
      // The model answered as a single scheme after all — treat it as one.
      out.q = out.q || questionText;
      out.derivedAt = Date.now();
      return res.status(200).json(out);
    }

    const scheme = await callModel(
      mcq ? MCQ_SYSTEM : DERIVE_SYSTEM,
      mcq ? buildMcqUser(questionText, topics, exclusions)
          : buildDeriveUser(questionText, topics, exclusions),
      1800);
    scheme.q = scheme.q || questionText;
    scheme.derivedAt = Date.now();
    res.status(200).json(scheme);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
