import { guard, safeEqual, normEmail, getMember, grantMember, revokeMember, sendLink, kv } from './_shared.js';

// The admin's door: let someone in for free, take access away, resend a link,
// or list members. Every call carries ADMIN_KEY, checked in constant time, and
// the ordinary per-IP rate limit in guard() throttles guessing. Nothing here is
// reachable from the pupil app.
export default async function handler(req, res) {
  if (!(await guard(req, res, { open: true }))) return;
  const { key, action, email, note, guardian } = req.body || {};
  const want = process.env.ADMIN_KEY;
  if (!want || want.length < 16 || !safeEqual(key, want)) return res.status(401).json({ error: 'Not allowed' });

  try {
    if (action === 'list') {
      const emails = (await kv('SMEMBERS', 'members')) || [];
      const members = [];
      for (const e of emails.sort()) { const m = await getMember(e); if (m) members.push(m); }
      return res.status(200).json({ ok: true, members });
    }

    const e = normEmail(email);
    if (!e) return res.status(400).json({ error: 'That is not an email address.' });

    if (action === 'grant') {
      await grantMember(e, 'admin', String(note || '').slice(0, 120), guardian);
      return res.status(200).json({ ok: true, message: e + ' now has access. A sign-in link has been sent.' });
    }
    if (action === 'revoke') {
      const done = await revokeMember(e);
      return res.status(200).json({ ok: true, message: done ? e + ' can no longer sign in.' : e + ' was not a member.' });
    }
    if (action === 'resend') {
      const m = await getMember(e);
      if (!m || !m.active) return res.status(400).json({ error: e + ' does not have access.' });
      await sendLink(e, req);
      return res.status(200).json({ ok: true, message: 'A new sign-in link has been sent to ' + e + '.' });
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('admin:', err.message);
    res.status(500).json({ error: err.message });
  }
}
