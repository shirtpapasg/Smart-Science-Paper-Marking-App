import { createHmac, timingSafeEqual } from 'node:crypto';
import { grantMember, revokeMember, normEmail, kv } from './_shared.js';

// Stripe calls this after a payment. The signature is checked against
// STRIPE_WEBHOOK_SECRET over the raw body, so a forged call cannot grant access.
// A completed, paid checkout grants membership and posts the sign-in link.
// A cancelled subscription or a refund takes it away.
//
// A cancelled subscription names only its customer, never an email, so the
// checkout remembers which email belongs to that customer and subscription:
//   stripe:cust:<customer id>      email
//   stripe:sub:<subscription id>   email
// Cancellations and refunds read the email from the event when it is there,
// and fall back to these keys when it is not.
export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

function verify(raw, header, secret) {
  const parts = Object.fromEntries(String(header || '').split(',').map(p => p.split('=')));
  const t = Number(parts.t), v1 = parts.v1;
  if (!t || !v1 || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const want = createHmac('sha256', secret).update(t + '.' + raw.toString('utf8')).digest('hex');
  const a = Buffer.from(want), b = Buffer.from(String(v1));
  return a.length === b.length && timingSafeEqual(a, b);
}

function emailOf(obj) {
  return normEmail(obj?.customer_details?.email || obj?.customer_email || obj?.receipt_email || obj?.billing_details?.email || '');
}

const idOf = v => (typeof v === 'string' ? v : v?.id) || '';

// Remember who bought, so a later cancellation can find them.
async function rememberBuyer(obj, email) {
  const customer = idOf(obj.customer), subscription = idOf(obj.subscription);
  if (customer) await kv('SET', 'stripe:cust:' + customer, email);
  if (subscription) await kv('SET', 'stripe:sub:' + subscription, email);
}

// The member an event is about: its own email if it has one, otherwise the
// email remembered for its subscription or customer.
async function memberOf(obj) {
  const direct = emailOf(obj);
  if (direct) return direct;
  const keys = [];
  if (obj.object === 'subscription' && obj.id) keys.push('stripe:sub:' + obj.id);
  const customer = idOf(obj.customer);
  if (customer) keys.push('stripe:cust:' + customer);
  for (const k of keys) {
    const e = normEmail(await kv('GET', k));
    if (e) return e;
  }
  return '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'Webhook not configured' });

  const raw = await rawBody(req);
  if (!verify(raw, req.headers['stripe-signature'], secret)) return res.status(400).json({ error: 'Bad signature' });

  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch (e) { return res.status(400).json({ error: 'Bad payload' }); }
  const obj = event.data?.object || {};

  try {
    if (event.type === 'checkout.session.completed' && obj.payment_status === 'paid') {
      const email = emailOf(obj);
      if (!email) return res.status(200).json({ received: true, note: 'no email on session' });
      // Before granting, so the link survives even if the sign-in email fails and Stripe retries.
      await rememberBuyer(obj, email);
      await grantMember(email, 'stripe', 'checkout ' + (obj.id || ''));
      return res.status(200).json({ received: true });
    }
    if (event.type === 'customer.subscription.deleted' || event.type === 'charge.refunded') {
      const email = await memberOf(obj);
      if (!email) return res.status(200).json({ received: true, note: 'no member found for ' + event.type });
      await revokeMember(email);
      return res.status(200).json({ received: true });
    }
    return res.status(200).json({ received: true, ignored: event.type });
  } catch (e) {
    console.error('stripe-webhook:', e.message);
    // 500 makes Stripe retry, which is what we want if the store or mail was down.
    return res.status(500).json({ error: 'Could not record the payment' });
  }
}
