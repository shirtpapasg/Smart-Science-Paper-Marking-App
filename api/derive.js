import { DERIVE_SYSTEM, buildDeriveUser, MCQ_SYSTEM, buildMcqUser } from '../marking-prompt.js';
import { syllabusContext, callModel, guard } from './_shared.js';

// Writes a mark scheme for a question the answer guide has never seen.
// This is the step that lets the app mark ANY question, not just the 247.
export default async function handler(req, res) {
  if (!(await guard(req, res))) return;
  const { questionText, format, log } = req.body || {};
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
    if (log) Object.assign(scheme, await tagForLog(scheme));
    res.status(200).json(scheme);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}

// ── My Learning Log: the syllabus's Ways of Thinking and Doing, and the process
//    skills a question calls on. One short call after the scheme is written.
const WOTD = ['Posing Questions', 'Designing Investigations', 'Conducting Investigations', 'Analysing Data', 'Using Models', 'Explaining & Designing', 'Communicating with Evidence', 'Informed Decisions'];
const PROCESS = ['Observing', 'Comparing', 'Classifying', 'Using apparatus and equipment', 'Communicating', 'Inferring', 'Predicting', 'Analysing', 'Generating possibilities', 'Evaluating', 'Formulating hypothesis'];
const TAG_SYSTEM = [
  'You tag Singapore primary school Science questions for a pupil\'s learning log.',
  'Ways of Thinking and Doing (choose exactly ONE that the question mainly asks for): ' + WOTD.join(' | '),
  'Process skills (choose ONE to THREE that answering it needs): ' + PROCESS.join(' | '),
  'Also rewrite the model answer in plain words a ten-year-old reads easily: one to three short sentences, no new science.',
  'Never mention any school. Reply with JSON only, no prose and no code fences.',
].join('\n');
async function tagForLog(scheme) {
  try {
    const t = await callModel(TAG_SYSTEM, [
      'Question: ' + String(scheme.q || '').slice(0, 1200),
      'Topic: ' + (scheme.topic || '') + ' · Level: ' + (scheme.level || ''),
      'Model answer: ' + String(scheme.modelAnswer || '').slice(0, 800),
      'Return exactly: {"wotd":"","processSkills":[],"plainAnswer":""}',
    ].join('\n'), 500);
    return {
      wotd: WOTD.includes(t.wotd) ? t.wotd : '',
      processSkills: (Array.isArray(t.processSkills) ? t.processSkills : []).filter(x => PROCESS.includes(x)).slice(0, 3),
      plainAnswer: String(t.plainAnswer || '').slice(0, 600),
    };
  } catch (e) { return { wotd: '', processSkills: [], plainAnswer: '' }; }
}
