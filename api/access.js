import { guard, lockOn, normEmail, getMember, putMember, sendLink, redeemLink, requestMember, readSession, kv } from './_shared.js';

// The three things a browser can do before it is signed in.
//   session — is the lock on, and does this browser hold a valid session?
//   login   — turn a one-time link token into a session
//   link    — post a fresh sign-in link to a registered email
// Every reply about an email is the same whether or not it is registered, so
// the endpoint cannot be used to discover who the members are.
// ── the pupil's saved work ──
// store:<email> is a hash of the app's own sm-* keys → {v, t}. The page keeps
// working from its own copy and pushes changes within a few seconds; on
// sign-in it pulls this and merges, so the notebook, the recall schedule, the
// profile and the lab badges follow the pupil to any device. Saving is exempt
// from the general per-IP limit (a busy pupil saves often) but every key must
// be one of the app's, and no single key may exceed the size cap.
const STORE_KEY_OK = /^sm-[a-z0-9-]{2,40}$/;
const STORE_MAX_VALUE = 400000, STORE_MAX_KEYS = 40;
async function memberFromReq(req, body) {
  let who = await requestMember(req);
  if (!who && body.session) {
    const e = readSession(String(body.session));
    if (e) { const m = await getMember(e).catch(() => null); if (m && m.active) who = e; }
  }
  return who;
}

export default async function handler(req, res) {
  const storing = /^store-/.test(String((req.body || {}).action || ''));
  if (!(await guard(req, res, { open: true, light: storing }))) return;
  const { action, token, email } = req.body || {};

  if (storing) {
    if (!lockOn()) return res.status(200).json({ locked: false, ok: true, store: {} });
    const who = await memberFromReq(req, req.body || {});
    if (!who) return res.status(401).json({ error: 'Please sign in to use Science Marking.', signIn: true });
    const hk = 'store:' + who;
    try {
      if (action === 'store-get') {
        const flat = (await kv('HGETALL', hk)) || [];
        const store = {};
        for (let i = 0; i + 1 < flat.length; i += 2) { try { store[flat[i]] = JSON.parse(flat[i + 1]); } catch (e) { /* skip a bad row */ } }
        return res.status(200).json({ ok: true, store, at: Date.now() });
      }
      if (action === 'store-one') {
        const key = String(req.body.key || '');
        if (!STORE_KEY_OK.test(key)) return res.status(400).json({ error: 'Bad key' });
        const raw = await kv('HGET', hk, key);
        let item = null; try { item = raw ? JSON.parse(raw) : null; } catch (e) { item = null; }
        return res.status(200).json({ ok: true, item });
      }
      if (action === 'store-del') {
        const keys = (Array.isArray(req.body.keys) ? req.body.keys : []).map(String).filter(k => STORE_KEY_OK.test(k)).slice(0, STORE_MAX_KEYS);
        if (keys.length) await kv('HDEL', hk, ...keys);
        return res.status(200).json({ ok: true, deleted: keys.length });
      }
      if (action === 'store-put') {
        const items = Array.isArray(req.body.items) ? req.body.items.slice(0, STORE_MAX_KEYS) : [];
        const args = [];
        for (const it of items) {
          if (!it || !STORE_KEY_OK.test(String(it.key || ''))) continue;
          const v = typeof it.v === 'string' ? it.v : JSON.stringify(it.v == null ? null : it.v);
          if (v.length > STORE_MAX_VALUE) return res.status(413).json({ error: 'That is too much to save at once.', key: it.key });
          args.push(it.key, JSON.stringify({ v, t: Number(it.t) || Date.now() }));
        }
        if (args.length) await kv('HSET', hk, ...args);
        return res.status(200).json({ ok: true, saved: args.length / 2, at: Date.now() });
      }
    } catch (e) {
      console.error('store:', e.message);
      return res.status(500).json({ error: 'Your work could not be saved to your account just now. It is still safe on this device.' });
    }
    return res.status(400).json({ error: 'Unknown action' });
  }

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
