import { callModel, guard } from './_shared.js';

// Reads the PRINTED question off a photograph. Never handwriting.
// The image is passed straight through and never written to storage.
export default async function handler(req, res) {
  if (!(await guard(req, res))) return;
  const body = req.body || {};
  const mediaType = body.mediaType || 'image/jpeg';
  // One question can run over two or three pages. They are read in ONE call so
  // the model keeps the stem, the diagram and every sub-part together — reading
  // them separately is what loses "as shown below" and the shared set-up.
  const pages = Array.isArray(body.images) && body.images.length
    ? body.images
    : (body.imageBase64 ? [body.imageBase64] : []);
  if (!pages.length) return res.status(400).json({ error: 'No image supplied' });
  if (pages.length > 3) return res.status(400).json({ error: 'Three pages at most.' });

  const system = [
    'You read Singapore primary school Science exam papers from photographs.',
    'Your only job is to transcribe the PRINTED question text. Rules:',
    '- Transcribe printed text exactly, including the question number and any sub-parts.',
    '- NEVER transcribe handwriting. If the page has a pupil\'s written answer on it, ignore it entirely.',
    '- If the question has a diagram, describe it in one short sentence under diagramNote.',
    '- If several questions are visible, return the clearest complete one and set moreOnPage true.',
    '- SEVERAL PAGES may be supplied. They are consecutive pages of the SAME question.',
    '  Transcribe them as one continuous question, in page order, keeping every sub-part',
    '  ((a), (b), (c)) and the shared stem. Do not repeat the stem for each part, and do',
    '  not treat a later page as a new question.',
    '- List the sub-part labels you found in parts, e.g. ["(a)","(b)"]. Empty array if none.',
    '- Set format to "mcq" only if the printed question offers four numbered options to',
    '  choose from. Otherwise "written".',
    '- If you cannot read it, set question to an empty string and say why in problem.',
    'Reply with JSON only, no prose and no code fences.',
  ].join('\n');

  const user = [
    ...pages.map(p => ({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: typeof p === 'string' ? p : p.base64 },
    })),
    { type: 'text', text: [
      pages.length > 1
        ? 'These are ' + pages.length + ' consecutive pages of the SAME question. Transcribe them as one question, in order.'
        : 'Transcribe the printed question from this photograph.',
      'Return exactly this shape:',
      '{"question":"","marks":null,"parts":[],"format":"written","diagramNote":null,"moreOnPage":false,"problem":null}',
      'marks: the total number in brackets if the paper shows one, else null.',
    ].join('\n') },
  ];

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!r.ok) return res.status(502).json({ error: 'Could not read the photo: ' + (await r.text()).slice(0, 200) });

    const data = await r.json();
    const t = String(data.content?.[0]?.text || '').trim()
      .replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return res.status(502).json({ error: 'The reply could not be read' });
    res.status(200).json(JSON.parse(t.slice(a, b + 1)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
