import { GHL_LOCATION_ID, getGhlToken, ghlRequest } from './_ghl.js';

const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const attributionKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const origin = req.headers?.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Please submit the form on this website.' });
    } catch { return res.status(403).json({ error: 'Invalid origin.' }); }
  }
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 6000) {
    return res.status(400).json({ error: 'Please enter your contact details.' });
  }
  const name = clean(body.name, 160).replace(/\s+/g, ' ');
  const email = clean(body.email, 180).toLowerCase();
  const phone = clean(body.phone, 30);
  const digits = phone.replace(/\D/g, '');
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !/^\+?[\d\s().-]+$/.test(phone) || digits.length < 7 || digits.length > 15
    || body.consent !== true || clean(body.website, 200)) {
    return res.status(400).json({ error: 'Please enter a valid name, email and phone number.' });
  }
  if (!getGhlToken()) return res.status(503).json({ error: 'Access requests are temporarily unavailable. Please try again shortly.' });

  const [firstName, ...rest] = name.split(' ');
  try {
    const result = await ghlRequest('/contacts/upsert', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ firstName, lastName: rest.join(' '), name, email, phone,
        locationId: GHL_LOCATION_ID, source: 'CR8OR Free Software Bundle' }),
    });
    const contactId = result?.contact?.id;
    if (!contactId) throw new Error('Missing contact ID');
    const attribution = attributionKeys.map(key => {
      const value = clean(body.attribution?.[key], 250).replace(/[\r\n]/g, ' ');
      return value ? `${key}: ${value}` : '';
    }).filter(Boolean);
    // Add tags separately so repeat opt-ins never replace an existing contact's tags.
    const extras = await Promise.allSettled([
      ghlRequest(`/contacts/${encodeURIComponent(contactId)}/tags`, {
        method: 'POST', signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ tags: ['cr8or-free-software'] }),
      }),
      ghlRequest(`/contacts/${encodeURIComponent(contactId)}/notes`, {
        method: 'POST', signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ body: [
          'Free growth software access requested at ' + new Date().toISOString(),
          'Page: https://scale.cr8or.ai/free-software/',
          'Contact permission: visitor requested contact by CR8OR about software access and setup (form notice v1).',
          'Software: CR8OR AI, Touch CRM, Spine, HIYE, Creative Analyser. Bonus: FundRocket brokerage.',
          ...attribution,
        ].join('\n') }),
      }),
    ]);
    extras.forEach((result, index) => {
      if (result.status === 'rejected') console.error('Software lead metadata failed', index, result.reason?.statusCode || 'upstream');
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    // Never expose contact data, integration credentials or upstream error payloads.
    console.error('Software lead capture failed', error?.statusCode || error?.name || 'upstream');
    return res.status(503).json({ error: 'We could not save your details. Please try again in a moment.' });
  }
}
