import { guard } from './_shared.js';

// The Genie's model call. The Genie page was written for claude.ai, where
// window.claude.complete answers a prompt with text; here the page calls this
// instead, and the answer comes from the same model, key and members lock as
// marking. Two shapes arrive: { prompt } for a question typed or pasted, and
// { messages } for a photographed question, where the page has already put the
// image in Anthropic's own content format. Text goes back, never JSON parsing:
// the page does its own reading of what comes back.
const MAX_PROMPT = 24000;
const MAX_IMAGE_B64 = 6 * 1024 * 1024;

function cleanMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) return null;
  return messages.slice(0, 4).map(m => {
    const content = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content || '') }];
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: content.slice(0, 6).map(c => {
      if (c.type === 'image' && c.source && c.source.type === 'base64') {
        const data = String(c.source.data || '');
        if (data.length > MAX_IMAGE_B64) throw new Error('That picture is too large. Try a smaller photo.');
        return { type: 'image', source: { type: 'base64', media_type: String(c.source.media_type || 'image/jpeg'), data } };
      }
      return { type: 'text', text: String(c.text || '').slice(0, MAX_PROMPT) };
    }) };
  });
}

export default async function handler(req, res) {
  if (!(await guard(req, res))) return;
  const { prompt, messages } = req.body || {};
  let msgs;
  try {
    msgs = messages ? cleanMessages(messages) : (prompt ? [{ role: 'user', content: String(prompt).slice(0, MAX_PROMPT) }] : null);
  } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!msgs) return res.status(400).json({ error: 'Nothing to think about.' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 2400, messages: msgs }),
    });
    if (!r.ok) throw new Error('Model call failed: ' + (await r.text()).slice(0, 200));
    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: 'The Genie could not think just now. Please try again.' });
  }
}
