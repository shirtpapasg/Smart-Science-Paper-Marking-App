import { callModel } from './_shared.js';

// Reads the PRINTED question off a photograph. Never handwriting.
// The image is passed straight through and never written to storage.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { imageBase64, mediaType = 'image/jpeg' } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'No image supplied' });

  const system = [
    'You read Singapore primary school Science exam papers from photographs.',
    'Your only job is to transcribe the PRINTED question text. Rules:',
    '- Transcribe printed text exactly, including the question number and any sub-parts.',
    '- NEVER transcribe handwriting. If the page has a pupil\'s written answer on it, ignore it entirely.',
    '- If the question has a diagram, describe it in one short sentence under diagramNote.',
    '- If several questions are visible, return the clearest complete one and set moreOnPage true.',
    '- If you cannot read it, set question to an empty string and say why in problem.',
    'Reply with JSON only, no prose and no code fences.',
  ].join('\n');

  const user = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
    { type: 'text', text: [
      'Transcribe the printed question from this photograph.',
      'Return exactly this shape:',
      '{"question":"","marks":null,"diagramNote":null,"moreOnPage":false,"problem":null}',
      'marks: the number in brackets if the paper shows one, else null.',
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
        max_tokens: 1200,
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
