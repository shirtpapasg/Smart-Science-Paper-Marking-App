import { LABS } from '../labs-p4.js';
import { MISCONCEPTIONS } from '../misconceptions.js';
import { SYSTEM, buildUserFromScheme } from '../marking-prompt.js';
import { callModel, guard, kv, sha256 } from './_shared.js';

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
  const speaking = !!(req.body && req.body.action === 'speak');
  if (!(await guard(req, res, { light: speaking }))) return;
  const { action, id } = req.body || {};

  if (action === 'speak') return speak(req, res);

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

// ── read aloud with a natural voice ──────────────────────────────────────────
// The steps page sends the text of one segment; this returns an mp3 (base64)
// and, when the provider gives them, the start time of every word so the page
// can light words up as they are spoken. Which service is used depends on the
// keys set in Vercel:
//   ELEVENLABS_API_KEY  (+ TTS_VOICE = a voice id)   word timings: exact
//   OPENAI_API_KEY      (+ TTS_VOICE = nova, coral…) word timings: estimated
//   TTS_PROVIDER        "elevenlabs" or "openai" when both keys exist
//   TTS_MODEL           optional model override
// With no key set the page falls back to the browser's own voice. Audio is
// cached for a month, so a segment read by many pupils costs once. Members only
// while the lock is on; per-IP limit here since the general one is too tight
// for "Read this part", which fetches several segments in a row.
const SPEAK_WINDOW = 10 * 60 * 1000, SPEAK_MAX = 150;
const speakHits = new Map();
async function speak(req, res) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const recent = (speakHits.get(ip) || []).filter(t => now - t < SPEAK_WINDOW);
  if (recent.length >= SPEAK_MAX) return res.status(429).json({ error: 'The reading voice needs a short rest. Try again in a few minutes.' });
  recent.push(now); speakHits.set(ip, recent);
  if (speakHits.size > 500) speakHits.delete(speakHits.keys().next().value);

  const text = String((req.body || {}).text || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (!text) return res.status(400).json({ error: 'Nothing to read' });
  const eleven = process.env.ELEVENLABS_API_KEY, openai = process.env.OPENAI_API_KEY;
  const provider = String(process.env.TTS_PROVIDER || (eleven ? 'elevenlabs' : openai ? 'openai' : '')).toLowerCase();
  if (!(provider === 'elevenlabs' && eleven) && !(provider === 'openai' && openai)) return res.status(200).json({ off: true });
  const voice = process.env.TTS_VOICE || (provider === 'elevenlabs' ? '21m00Tcm4TlvBwEV0DKD' : 'nova');
  const key = 'tts:' + sha256(provider + '|' + voice + '|' + (process.env.TTS_MODEL || '') + '|' + text);
  try { const hit = await kv('GET', key); if (hit) return res.status(200).json(JSON.parse(hit)); } catch (e) { /* no cache: fine */ }
  let out;
  try {
    out = provider === 'elevenlabs' ? await speakEleven(text, voice, eleven) : await speakOpenAI(text, voice, openai);
  } catch (e) {
    console.error('speak:', e.message);
    return res.status(502).json({ error: 'The reading voice is not available right now.' });
  }
  try { await kv('SET', key, JSON.stringify(out), 'EX', 60 * 60 * 24 * 30); } catch (e) { /* no cache: fine */ }
  return res.status(200).json(out);
}

async function speakOpenAI(text, voice, apiKey) {
  const model = process.env.TTS_MODEL || 'gpt-4o-mini-tts';
  const body = { model, voice, input: text, response_format: 'mp3' };
  if (/^gpt-4o/.test(model)) body.instructions = 'You are a warm, patient primary school science teacher reading to a nine-year-old who finds reading hard. Speak clearly at an easy, unhurried pace with natural expression. Pause briefly at each full stop. Read "Option 1", "Option 2" as items in a list.';
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('openai ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return { audio: Buffer.from(await r.arrayBuffer()).toString('base64'), marks: null, provider: 'openai' };
}

async function speakEleven(text, voice, apiKey) {
  const model = process.env.TTS_MODEL || 'eleven_multilingual_v2';
  const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voice) + '/with-timestamps?output_format=mp3_44100_96', {
    method: 'POST', headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true } }),
  });
  if (!r.ok) throw new Error('elevenlabs ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const d = await r.json();
  return { audio: d.audio_base64, marks: marksFromAlignment(d.alignment), provider: 'elevenlabs' };
}

// ElevenLabs gives a start and end time per character. Group them into words:
// each mark is { start, end } as character offsets in the text plus t0/t1 in seconds.
export function marksFromAlignment(al) {
  if (!al || !Array.isArray(al.characters)) return null;
  const marks = []; let cur = null;
  al.characters.forEach((ch, i) => {
    const t0 = al.character_start_times_seconds[i], t1 = al.character_end_times_seconds[i];
    if (/\s/.test(ch)) { if (cur) { marks.push(cur); cur = null; } return; }
    if (!cur) cur = { start: i, end: i + 1, t0, t1 }; else { cur.end = i + 1; cur.t1 = t1; }
  });
  if (cur) marks.push(cur);
  return marks;
}
