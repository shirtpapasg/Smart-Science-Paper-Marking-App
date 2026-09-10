import { DERIVE_SYSTEM, buildDeriveUser, MCQ_SYSTEM, buildMcqUser } from '../marking-prompt.js';
import { syllabusContext, callModel, guard } from './_shared.js';

// Writes a mark scheme for a question the answer guide has never seen.
// This is the step that lets the app mark ANY question, not just the 247.
export default async function handler(req, res) {
  if (!(await guard(req, res))) return;
  const { questionText, format } = req.body || {};
  if (!String(questionText || '').trim()) return res.status(400).json({ error: 'No question supplied' });

  try {
    const { topics, exclusions } = syllabusContext();
    const mcq = format === 'mcq';
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
