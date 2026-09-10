import { lockOn, kv, logMeta, sendReport, safeEqual } from './_shared.js';

// Safety net for session reports. The app mails a report itself when the
// window closes or an hour passes idle, but a phone that is switched off or a
// tab that is killed sends nothing — this sweep finds any session quiet for an
// hour and mails it. Run it on a schedule: the daily Vercel cron in vercel.json
// (sends "Authorization: Bearer CRON_SECRET"), or any scheduler calling with
// the x-cron-key header, as often as every 15 minutes.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return res.status(503).json({ error: 'CRON_SECRET not set' });
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(req.headers['x-cron-key'] || '');
  if (!safeEqual(given, secret)) return res.status(401).json({ error: 'Not allowed' });
  if (!lockOn()) return res.status(200).json({ ok: true, off: true });

  try {
    const sids = (await kv('SMEMBERS', 'logs:open')) || [];
    const cutoff = Date.now() - 60 * 60 * 1000;
    let sent = 0, skipped = 0, failed = 0;
    for (const sid of sids.slice(0, 50)) {
      const meta = await logMeta(sid);
      if (!meta) { await kv('SREM', 'logs:open', sid); continue; }
      if ((meta.last || 0) > cutoff) { skipped++; continue; }
      try { if (await sendReport(sid)) sent++; } catch (e) { failed++; console.error('report-run:', sid, e.message); }
    }
    res.status(200).json({ ok: true, open: sids.length, sent, skipped, failed });
  } catch (e) {
    console.error('report-run:', e.message);
    res.status(500).json({ error: e.message });
  }
}
