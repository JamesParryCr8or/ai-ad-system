import { createHash } from 'node:crypto';
import { GHL_LOCATION_ID, getGhlToken, ghlRequest } from './_ghl.js';

const base = 'https://scale.cr8or.ai';
const offer = 'bespoke-website-49';
async function stripe(path, body, key) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_API_KEY}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': key } : {}) },
    ...(body ? { body: new URLSearchParams(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error('Payment service unavailable');
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (req.method === 'GET') {
    const id = req.query?.session_id;
    if (typeof id !== 'string' || !/^cs_(live|test)_[a-zA-Z0-9]{20,200}$/.test(id)) return res.status(400).json({ error: 'Invalid order reference.' });
    try {
      const session = await stripe(`checkout/sessions/${encodeURIComponent(id)}`);
      if (session.metadata?.offer !== offer || session.currency !== 'gbp' || session.amount_total !== 4900) return res.status(404).json({ error: 'Order not found.' });
      const paid = session.status === 'complete' && session.payment_status === 'paid';
      let contact = null;
      if (paid && typeof session.customer === 'string') {
        const customer = await stripe(`customers/${encodeURIComponent(session.customer)}`).catch(() => null);
        if (customer) contact = { name: customer.name || '', email: customer.email || '', phone: customer.phone || '' };
      }
      return res.status(200).json({ paid, reference: session.id, ...(contact ? { contact } : {}) });
    } catch (error) {
      if (error.statusCode === 404) return res.status(404).json({ error: 'Order not found.' });
      return res.status(503).json({ error: 'We could not verify your payment yet. Please refresh shortly.' });
    }
  }
  if (req.headers?.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Please use the form on this website.' }); }
    catch { return res.status(403).json({ error: 'Invalid origin.' }); }
  }
  const b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b) || JSON.stringify(b).length > 6000) return res.status(400).json({ error: 'Please enter your details.' });
  const clean = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  const name = clean(b.name, 160).replace(/\s+/g, ' '), email = clean(b.email, 180).toLowerCase(), phone = clean(b.phone, 30);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\+?[\d\s().-]+$/.test(phone) || !/^[0-9]{7,15}$/.test(phone.replace(/\D/g, '')) || b.consent !== true || b.website || !/^[a-zA-Z0-9-]{20,80}$/.test(b.requestId || '')) return res.status(400).json({ error: 'Please enter a valid name, email and phone number.' });
  if (!getGhlToken() || !process.env.STRIPE_SECRET_API_KEY) return res.status(503).json({ error: 'Checkout is temporarily unavailable. Please try again shortly.' });
  let saved = false;
  try {
    const [firstName, ...last] = name.split(' ');
    const contact = await ghlRequest('/contacts/upsert', { method: 'POST', signal: AbortSignal.timeout(10000), body: JSON.stringify({ name, firstName, lastName: last.join(' '), email, phone, locationId: GHL_LOCATION_ID, source: 'CR8OR £49 Website' }) });
    const contactId = contact?.contact?.id;
    if (!contactId) throw new Error('Lead unavailable');
    saved = true;
    await ghlRequest(`/contacts/${encodeURIComponent(contactId)}/tags`, { method: 'POST', signal: AbortSignal.timeout(5000), body: JSON.stringify({ tags: ['cr8or-website-49-enquiry'] }) }).catch(() => {});
    const key = createHash('sha256').update(JSON.stringify([b.requestId, name, email, phone])).digest('hex');
    const customer = await stripe('customers', { name, email, phone, 'metadata[offer]': offer, 'metadata[ghl_contact_id]': contactId }, `website-customer-${key}`);
    const session = await stripe('checkout/sessions', {
      mode: 'subscription', customer: customer.id, client_reference_id: contactId,
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': 'gbp',
      'line_items[0][price_data][unit_amount]': '4900',
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': 'CR8OR Bespoke Website',
      'line_items[0][price_data][product_data][description]': 'Personally planned, done-for-you website with a one-hour exploration call with James, hosting and a standard annual domain (or connect your own). Delivery within 7 days after we receive your brief and assets.',
      'line_items[0][quantity]': '1',
      'metadata[offer]': offer, 'metadata[ghl_contact_id]': contactId,
      'subscription_data[metadata][offer]': offer, 'subscription_data[metadata][ghl_contact_id]': contactId,
      success_url: `${base}/websites/thanks.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/websites/?checkout=cancelled#access`,
      'custom_text[submit][message]': '£49 per month, billed monthly from today. Your 7-day delivery starts once we receive your website brief and assets.',
    }, `website-checkout-${key}`);
    if (!session.url?.startsWith('https://checkout.stripe.com/')) throw new Error('Checkout unavailable');
    return res.status(200).json({ url: session.url });
  } catch {
    return res.status(503).json({ error: saved ? 'Your details are saved, but checkout could not open. Please try again.' : 'We could not save your details. Please try again shortly.' });
  }
}
