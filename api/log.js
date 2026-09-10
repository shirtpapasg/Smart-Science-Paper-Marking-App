import { guard, lockOn, requestMember, readSession, getMember, kv, logMeta, sendReport, LOG_TTL } from './_shared.js';

// The session record. The app posts one event per thing that happens, the
// photographed pages as they are read, and "end" when the window closes or an
// hour passes with nothing done. "end" mails the report at once.
//
// A browser closing a tab can only send a beacon, and a beacon cannot carry
// headers, so the session token may arrive in the body instead. Either way the
// caller must be a member, and a session id belongs to the member who opened it.
export default async function handler(req, res) {
  if (!(await guard(req, res, { open: true, light: true }))) return;
  if (!lockOn()) return res.status(200).json({ ok: false, off: true });

  const b = req.body || {};
  let email = await requestMember(req);
  if (!email && b.session) {
    const e = readSession(b.session);
    if (e) { const m = await getMember(e).catch(() => null); if (m && m.active) email = e; }
  }
  if (!email) return res.status(401).json({ error: 'Please sign in to use Science Marking.', signIn: true });

  const sid = String(b.sid || '');
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(sid)) return res.status(400).json({ error: 'Bad session id' });

  try {
    let meta = await logMeta(sid);
    if (meta && meta.email !== email) return res.status(403).json({ error: 'Not your session' });
    const now = Date.now();

    if (b.action === 'event') {
      const ev = (b.ev && typeof b.ev === 'object') ? b.ev : {};
      const s = JSON.stringify({ ...ev, t: now });
      if (s.length > 24000) return res.status(400).json({ error: 'That is too long.' });
      meta = { ...(meta || { email, started: now }), last: now };
      await kv('RPUSH', 'log:' + sid, s);
      await kv('EXPIRE', 'log:' + sid, LOG_TTL);
      await kv('SET', 'logmeta:' + sid, JSON.stringify(meta), 'EX', LOG_TTL);
      await kv('SADD', 'logs:open', sid);
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'image') {
      const jpeg = String(b.jpeg || '');
      if (!/^[A-Za-z0-9+/=]+$/.test(jpeg) || jpeg.length > 700000) return res.status(400).json({ error: 'That picture is too large to keep.' });
      const n = Number(await kv('INCR', 'imgn:' + sid));
      await kv('EXPIRE', 'imgn:' + sid, LOG_TTL);
      if (n > 12) return res.status(200).json({ ok: false, ref: null });
      await kv('SET', 'img:' + sid + ':' + n, jpeg, 'EX', LOG_TTL);
      return res.status(200).json({ ok: true, ref: n });
    }

    if (b.action === 'end') {
      if (!meta) return res.status(200).json({ ok: true, sent: false });
      const sent = await sendReport(sid);
      return res.status(200).json({ ok: true, sent });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('log:', e.message);
    res.status(500).json({ error: 'The session record could not be saved.' });
  }
}
