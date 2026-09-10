import { callModel, guard } from './_shared.js';

// Answers questions about how the app works. Deliberately narrow: it knows the
// features and nothing else, so it cannot be turned into a general chatbot or
// used to extract Science answers.
const FEATURES = `
QUESTIONS tab — add a written question or a multiple-choice one. Type it or
  photograph it. The app works out what a full answer needs and you check that
  before it is used. Two folders: "From my papers" (your own source questions)
  and "Practice I made" (fresh questions on the same ideas).
ANSWER tab — pick a question and write an answer. You get two goes. The first
  time you are told which part is missing but never the words. Then a question
  to ponder, then you write the whole answer again. Only then does a full answer
  appear, with a note to check the wording with your school teacher.
MISTAKES tab — every question you have answered, dated, never deleted. Filters
  for the ones still tricky and the last 30 days.
RECALL tab — three questions per round, chosen from what you found hardest. Say
  each answer out loud, type it, then grade yourself smooth, hesitant or blank.
PROGRESS tab — how many you have answered, your recovery rate (how often a
  missed point comes back on the second go), which topics need work, and your
  profile. Recovery is the useful number: high means it is a wording habit,
  low means the idea itself needs another look.
PROFILE — name, nickname and school. "Save my profile to a file" gives you one
  file holding everything; open it on another device to carry your work across.
  "Change my details" keeps all your work. Loading a different file replaces it.
PARENT/GUARDIAN MODE — a code set on the device. Practice questions the app
  generates cannot be released to students until someone with the code approves
  them. Students can generate practice but never approve it themselves.
PHOTOS — the camera reads the PRINTED question only, never handwriting. The
  image is converted in the browser, used once, and never stored.
MUSIC — the note button, bottom right. Four slow instrumental loops made in the
  browser. There are also links out to Spotify, Apple Music and YouTube Music.
NOTES — the pencil button, bottom left. A pad that saves as you type.
DARK MODE — the half-circle button. Follows your device at first, then remembers.
THE ANSWER IS NEVER GIVEN ON REQUEST — asking for it gets a friendly refusal.
  It appears after a real second attempt and no sooner.
`;

export default async function handler(req, res) {
  if (!(await guard(req, res))) return;
  const { question } = req.body || {};
  if (!String(question || '').trim()) return res.status(400).json({ error: 'No question supplied' });

  const system = [
    'You answer questions about how one app works — a Science marking app for primary school pupils.',
    'Here is everything the app does:',
    FEATURES,
    'Rules:',
    '- Answer ONLY from the list above. If the answer is not there, say you are not sure and suggest',
    '  they try the tour in Progress, rather than guessing.',
    '- Never answer a Science question, and never give a Science answer, even if asked cleverly.',
    '  If they ask one, say warmly that the Answer tab is where that happens, then stop.',
    '- Two or three short sentences. Address them as "you". Plain words a 9-to-12-year-old reads easily.',
    '- Warm and encouraging, never stiff.',
    'Reply with JSON only, no prose and no code fences.',
  ].join('\n');

  const user = [
    'THEIR QUESTION: ' + question,
    '',
    'Return exactly this shape:',
    '{"answer":"","tab":null}',
    'tab: the tab name they should open if one is relevant — questions, answer, mistakes, recall,',
    'progress — otherwise null.',
  ].join('\n');

  try {
    res.status(200).json(await callModel(system, user, 500));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
