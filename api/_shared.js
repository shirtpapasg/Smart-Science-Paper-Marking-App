import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { TOPICS } from '../syllabus-p3p5.js';

export function syllabusContext() {
  const topics = TOPICS.map(t => t.levels.join('/') + ' · ' + t.theme + ' · ' + t.topic +
    (t.outcomes && t.outcomes.length ? ' — ' + t.outcomes.slice(0,3).join('; ') : '')).join('\n');
  const exclusions = TOPICS.flatMap(t => (t.excludes || []).map(e => t.topic + ': ' + e)).join('\n');
  return { topics, exclusions };
}

export function extractJson(text) {
  const t = String(text || '').trim().replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}

export async function callModel(system, user, maxTokens = 1600) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error('Model call failed: ' + (await r.text()).slice(0, 300));
  const data = await r.json();
  const parsed = extractJson(data.content?.[0]?.text);
  if (!parsed) throw new Error('The reply was not readable JSON');
  return parsed;
}

/* ═══ MEMBERS ONLY ═══════════════════════════════════════════════════════════
   Access to every model-calling endpoint is for members: someone whose Stripe
   payment has completed, or someone the admin has let in for free. A member
   signs in with a one-time link sent to their registered email; the link turns
   into a signed session the browser sends with every call.

   The lock is OFF until ACCESS_LOCK=on and SESSION_SECRET are set, so the app
   keeps working exactly as before while the pieces below are being configured.

   Storage is Upstash Redis over REST (the Vercel Marketplace integration sets
   KV_REST_API_URL / KV_REST_API_TOKEN). Keys:
     member:<email>   {email, source:'stripe'|'admin', active, createdAt, note}
     members          set of emails, for the admin list
     link:<sha256>    email, expires in 24h, deleted on first use
     rl:link:<email>  count of sign-in links requested this hour

   Secrets stay server-side. Tokens are stored hashed, compared in constant
   time, and never logged.
   ═══════════════════════════════════════════════════════════════════════════ */

export const lockOn = () => String(process.env.ACCESS_LOCK || '').toLowerCase() === 'on' && !!process.env.SESSION_SECRET;

const kvUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const kvTok = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

// One Redis command, e.g. kv('SET', 'k', 'v', 'EX', 86400). Returns the result.
export async function kv(...cmd) {
  if (!kvUrl() || !kvTok()) throw new Error('The member store is not configured');
  const r = await fetch(kvUrl(), {
    method: 'POST',
    headers: { authorization: 'Bearer ' + kvTok(), 'content-type': 'application/json' },
    body: JSON.stringify(cmd.map(c => String(c))),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error('Member store error: ' + (d.error || r.status));
  return d.result;
}

export const sha256 = s => createHash('sha256').update(String(s)).digest('hex');
const b64u = b => Buffer.from(b).toString('base64url');

// Constant-time string comparison that does not leak length either.
export function safeEqual(a, b) {
  const x = createHash('sha256').update(String(a || '')).digest();
  const y = createHash('sha256').update(String(b || '')).digest();
  return timingSafeEqual(x, y) && String(a || '').length === String(b || '').length;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export function normEmail(e) {
  const s = String(e || '').trim().toLowerCase();
  return EMAIL_RE.test(s) && s.length <= 254 ? s : '';
}

export async function getMember(email) {
  const raw = await kv('GET', 'member:' + email);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export async function putMember(m) {
  await kv('SET', 'member:' + m.email, JSON.stringify(m));
  await kv('SADD', 'members', m.email);
}

// Grant access and post the sign-in link. Idempotent: a repeat payment or a
// second grant re-activates and re-sends rather than duplicating.
export async function grantMember(email, source, note, guardian) {
  const now = Date.now();
  const cur = (await getMember(email)) || { email, createdAt: now };
  await putMember({ ...cur, source: cur.source || source, active: true, note: note || cur.note || '',
    guardian: normEmail(guardian) || cur.guardian || '', updatedAt: now });
  return sendLink(email);
}

export async function revokeMember(email) {
  const cur = await getMember(email);
  if (!cur) return false;
  await putMember({ ...cur, active: false, updatedAt: Date.now() });
  return true;
}

// ── sign-in links ──
export function appUrl(req) {
  return (process.env.APP_URL || process.env.ALLOWED_ORIGIN || ('https://' + (req?.headers?.host || ''))).replace(/\/$/, '');
}

export async function sendLink(email, req) {
  const token = b64u(randomBytes(32));
  await kv('SET', 'link:' + sha256(token), email, 'EX', 86400);
  const url = appUrl(req) + '/?k=' + token;
  await sendMail(email, 'Your sign-in link for Science Marking',
    `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.55;color:#1d2a44;max-width:520px">
      <p style="font-size:20px;font-weight:700;margin:0 0 12px">Science Marking</p>
      <p>Here is your sign-in link. It works once and lasts 24 hours.</p>
      <p style="margin:22px 0"><a href="${url}" style="background:#1f8a4c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;display:inline-block">Open Science Marking</a></p>
      <p style="font-size:14px;color:#4d5b76">If the button does not work, copy this address into your browser:<br>${url}</p>
      <p style="font-size:14px;color:#4d5b76">Did not ask for this? You can ignore it — nothing happens unless the link is opened.</p>
    </div>`,
    `Science Marking\n\nHere is your sign-in link. It works once and lasts 24 hours.\n\n${url}\n\nDid not ask for this? Ignore it — nothing happens unless the link is opened.\n`);
  return true;
}

// Turn a link token into a session. Single use: the key is read and deleted in one step.
export async function redeemLink(token) {
  const t = String(token || '');
  if (t.length < 20 || t.length > 200) return null;
  const email = await kv('GETDEL', 'link:' + sha256(t));
  if (!email) return null;
  const m = await getMember(email);
  if (!m || !m.active) return null;
  return makeSession(email);
}

// ── sessions: v1.<payload>.<hmac> ──
const SESSION_DAYS = 90;
export function makeSession(email) {
  const payload = b64u(JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 864e5, n: b64u(randomBytes(8)) }));
  const sig = createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  return 'v1.' + payload + '.' + sig;
}

export function readSession(tok) {
  const parts = String(tok || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !process.env.SESSION_SECRET) return null;
  const want = createHmac('sha256', process.env.SESSION_SECRET).update(parts[1]).digest('base64url');
  if (!safeEqual(want, parts[2])) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (!p.e || !p.x || p.x < Date.now()) return null;
    return p.e;
  } catch (e) { return null; }
}

// The member behind a request, or null. Revocation takes effect within a minute
// because membership is re-read, with a short per-instance cache to keep the
// store out of the hot path.
const memberCache = new Map();   // email -> {active, at}
export async function requestMember(req) {
  const h = String(req.headers.authorization || '');
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const email = readSession(tok);
  if (!email) return null;
  const c = memberCache.get(email);
  if (c && Date.now() - c.at < 60000) return c.active ? email : null;
  const m = await getMember(email).catch(() => null);
  const active = !!(m && m.active);
  memberCache.set(email, { active, at: Date.now() });
  if (memberCache.size > 2000) memberCache.delete(memberCache.keys().next().value);
  return active ? email : null;
}

// ── mail, through Resend's REST API ──
export async function sendMail(to, subject, html, text, attachments) {
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
  if (!key || !from) throw new Error('Mail is not configured');
  const msg = { from, to: Array.isArray(to) ? to : [to], subject, html, text };
  if (attachments && attachments.length) msg.attachments = attachments;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify(msg),
  });
  if (!r.ok) throw new Error('Mail failed: ' + (await r.text()).slice(0, 200));
  return true;
}

/* ═══ SESSION REPORTS ═══════════════════════════════════════════════════════
   Everything a member does in one sitting — questions added, pages photographed,
   answers written, what the app showed back — is recorded against their account
   and mailed to the registered email and the guardian's email when the window
   closes or after an hour with no activity. Records live 48 hours, long enough
   to be mailed and retried, then expire.

     logmeta:<sid>   {email, started, last, mailed?}
     log:<sid>       list of events, JSON, in order
     imgn:<sid>      how many page photos were stored
     img:<sid>:<n>   a photographed page, JPEG base64
     logs:open       sids not yet mailed, for the sweep
   ═══════════════════════════════════════════════════════════════════════════ */
export const LOG_TTL = 172800;
const SGT = { timeZone: 'Asia/Singapore' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = t => new Date(t).toLocaleTimeString('en-SG', { ...SGT, hour: '2-digit', minute: '2-digit' });
const day = t => new Date(t).toLocaleDateString('en-SG', { ...SGT, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export async function logMeta(sid) {
  const r = await kv('GET', 'logmeta:' + sid);
  try { return r ? JSON.parse(r) : null; } catch (e) { return null; }
}

function eventHtml(ev) {
  const row = (label, body) => '<div style="margin:14px 0;padding:12px 14px;border-left:4px solid #d5dbe7;background:#f7f8fb">' +
    '<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4d5b76">' + when(ev.t) + ' · ' + esc(label) + '</div>' + body + '</div>';
  const p = (k, v) => v ? '<p style="margin:6px 0"><b>' + esc(k) + ':</b> ' + esc(v) + '</p>' : '';
  switch (ev.type) {
    case 'start': return row('Session started', p('Profile', ev.name || 'not set'));
    case 'photo': return row('Question photographed', p('Pages', ev.pages) + p('Read from the page', ev.transcript) +
      (ev.images && ev.images.length ? '<p style="margin:6px 0;color:#4d5b76">Attached as ' + ev.images.map(n => 'page-' + n + '.jpg').join(', ') + '</p>' : ''));
    case 'scheme': return row('Question added', p('Question', ev.q) + p('Type', ev.format === 'mcq' ? 'multiple choice' : 'written') +
      p('Full answer the app worked out', ev.model) + p('Marks', ev.marks));
    case 'answer': return row('Answer marked', p('Question', ev.q) + p('First attempt', ev.a1) + p('Second attempt', ev.a2) +
      p('Marks', ev.marks != null ? ev.marks + ' of ' + ev.max : '') + p('Full answer shown to the pupil', ev.model));
    case 'mcq': return row('Multiple choice answered', p('Question', ev.q) + p('Chose', ev.chose) + p('Correct', ev.correct ? 'yes' : 'no') +
      p('Pupil\'s reason', ev.why) + p('Explanation shown to the pupil', ev.model));
    case 'practice': return row('Practice generated', (ev.stems || []).map(s => '<p style="margin:6px 0">' + esc(s) + '</p>').join(''));
    case 'help': return row('Asked the helper', p('Question', ev.q) + p('Reply', ev.a));
    case 'end': return row('Session ended', '');
    default: return row(ev.type || 'Activity', p('Details', JSON.stringify(ev).slice(0, 400)));
  }
}

export async function sendReport(sid) {
  const meta = await logMeta(sid);
  if (!meta || meta.mailed) { await kv('SREM', 'logs:open', sid); return false; }
  const events = ((await kv('LRANGE', 'log:' + sid, 0, -1)) || [])
    .map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  const real = events.filter(e => e.type !== 'start' && e.type !== 'end');
  if (!real.length) {   // opened and closed without doing anything: nothing to report
    await kv('SET', 'logmeta:' + sid, JSON.stringify({ ...meta, mailed: Date.now(), empty: true }), 'EX', LOG_TTL);
    await kv('SREM', 'logs:open', sid);
    return false;
  }
  const member = await getMember(meta.email);
  const to = [meta.email];
  if (member && member.guardian && member.guardian !== meta.email) to.push(member.guardian);

  const attachments = [];
  const n = Number(await kv('GET', 'imgn:' + sid)) || 0;
  for (let i = 1; i <= Math.min(n, 12); i++) {
    const b = await kv('GET', 'img:' + sid + ':' + i);
    if (b) attachments.push({ filename: 'page-' + i + '.jpg', content: b });
  }

  const started = meta.started || events[0].t, ended = meta.last || events[events.length - 1].t;
  const title = 'Science Marking — session report, ' + day(started);
  const html = '<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.55;color:#1d2a44;max-width:640px">' +
    '<p style="font-size:20px;font-weight:700;margin:0 0 4px">Science Marking</p>' +
    '<p style="margin:0 0 16px;color:#4d5b76">Session report for ' + esc(meta.email) + '<br>' + esc(day(started)) + ', ' + when(started) + ' to ' + when(ended) + '</p>' +
    '<p>Everything below is exactly what happened in the app: the questions worked on, the words your child wrote, and the words the app showed back. ' +
    (attachments.length ? 'The photographed pages are attached. ' : '') + 'This report is sent every time the app is closed or left for an hour.</p>' +
    events.map(eventHtml).join('') +
    '<p style="font-size:14px;color:#4d5b76;margin-top:24px">Something look wrong? Reply to this email. The mark that counts is always the one your child\'s teacher gives.</p></div>';
  const text = 'Science Marking — session report\n' + day(started) + ', ' + when(started) + ' to ' + when(ended) + '\n\n' +
    events.map(e => when(e.t) + '  ' + e.type + '  ' + JSON.stringify(e).slice(0, 600)).join('\n');

  await sendMail(to, title, html, text, attachments);
  await kv('SET', 'logmeta:' + sid, JSON.stringify({ ...meta, mailed: Date.now(), to }), 'EX', LOG_TTL);
  await kv('SREM', 'logs:open', sid);
  return true;
}

// Front door for every API function. Sends the error response itself and
// returns false, or returns true so the handler can carry on. Pass
// { open: true } for the few endpoints a signed-out visitor must reach.
const WINDOW_MS = 10 * 60 * 1000, MAX_HITS = 30, MAX_IPS = 500;
const CAPS = { questionText: 1500, question: 1500, answer: 800, pupilAnswer: 800, imageBase64: 8000000, email: 254, token: 200 };
const hits = new Map();   // ip -> [timestamps]

export async function guard(req, res, opts = {}) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return false; }

  const allowed = process.env.ALLOWED_ORIGIN;
  if (allowed) {
    const ok = [req.headers.origin, req.headers.referer].some(h => h && String(h).startsWith(allowed));
    if (!ok) { res.status(403).json({ error: 'Not allowed' }); return false; }
  }

  // Per-IP rate limit. Activity logging is exempt ({ light: true }): it is
  // cheap, member-authenticated, and a busy pupil produces a lot of it.
  if (!opts.light) {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
    if (recent.length >= MAX_HITS) {
      hits.set(ip, recent);
      res.status(429).json({ error: 'Too many requests. Wait a few minutes.' });
      return false;
    }
    recent.push(now);
    if (!hits.has(ip) && hits.size >= MAX_IPS) hits.delete(hits.keys().next().value);
    hits.set(ip, recent);
  }

  const body = req.body || {};
  for (const [field, cap] of Object.entries(CAPS)) {
    if (body[field] != null && String(body[field]).length > cap) {
      res.status(400).json({ error: 'That is too long.' });
      return false;
    }
  }

  if (lockOn() && !opts.open) {
    const email = await requestMember(req);
    if (!email) { res.status(401).json({ error: 'Please sign in to use Science Marking.', signIn: true }); return false; }
    req.member = email;
  }
  return true;
}
