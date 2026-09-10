import { guard, lockOn, normEmail, getMember, putMember, sendLink, redeemLink, requestMember, kv } from './_shared.js';

// The three things a browser can do before it is signed in.
//   session — is the lock on, and does this browser hold a valid session?
//   login   — turn a one-time link token into a session
//   link    — post a fresh sign-in link to a registered email
// Every reply about an email is the same whether or not it is registered, so
// the endpoint cannot be used to discover who the members are.
export default async function handler(req, res) {
  if (!(await guard(req, res, { open: true }))) return;
  const { action, token, email } = req.body || {};

  try {
    if (action === 'session') {
      if (!lockOn()) return res.status(200).json({ locked: false, ok: true });
      const who = await requestMember(req);
      return res.status(200).json({ locked: true, ok: !!who });
    }

    if (action === 'login') {
      if (!lockOn()) return res.status(200).json({ locked: false, ok: true });
      const session = await redeemLink(token);
      if (!session) return res.status(400).json({ error: 'That link has been used or has expired. Ask for a new one below.' });
      return res.status(200).json({ ok: true, session });
    }

    if (action === 'link') {
      const e = normEmail(email);
      const reply = { ok: true, message: 'If that address is registered, a sign-in link is on its way. It works once and lasts 24 hours.' };
      if (!e || !lockOn()) return res.status(200).json(reply);
      // Three links an hour per address, whatever the answer.
      const n = await kv('INCR', 'rl:link:' + e);
      if (n === 1) await kv('EXPIRE', 'rl:link:' + e, 3600);
      if (n > 3) return res.status(200).json(reply);
      const m = await getMember(e);
      if (m && m.active) await sendLink(e, req);
      return res.status(200).json(reply);
    }

    // Signed-in members only, from here down.
    if (action === 'me' || action === 'guardian') {
      if (!lockOn()) return res.status(200).json({ locked: false, ok: true, email: '', guardian: '' });
      const who = await requestMember(req);
      if (!who) return res.status(401).json({ error: 'Please sign in to use Science Marking.', signIn: true });
      const m = await getMember(who);
      if (action === 'guardian') {
        // Where session reports go besides the member. Empty clears it.
        const g = String(email || '').trim() ? normEmail(email) : '';
        if (String(email || '').trim() && !g) return res.status(400).json({ error: 'That is not an email address.' });
        await putMember({ ...m, guardian: g, updatedAt: Date.now() });
        return res.status(200).json({ ok: true, email: who, guardian: g });
      }
      return res.status(200).json({ ok: true, email: who, guardian: (m && m.guardian) || '' });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('access:', e.message);
    res.status(500).json({ error: 'Signing in is not available right now. Please try again in a moment.' });
  }
}
