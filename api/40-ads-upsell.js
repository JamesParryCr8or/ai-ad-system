const BASE_URL = process.env.CR8OR_FUNNEL_BASE_URL || 'https://scale.cr8or.ai';

const OFFERS = {
  campaignSetup: { name: 'Meta Campaign Launch', amount: 19900, mode: 'payment', next: '/40-ads/creator-ai' },
  creatorAi: { name: 'Creator AI Annual Access', amount: 19700, mode: 'subscription', interval: 'year', next: '/40-ads/optimisation' },
  optimisation: { name: '30-Day Campaign Optimisation Sprint', amount: 39900, mode: 'payment', next: '/40-ads/brief' }
};

async function createHostedCheckout({ headers, selected, offer, customer, customerEmail }) {
  const params = new URLSearchParams({
    mode: selected.mode,
    'line_items[0][price_data][currency]': 'gbp',
    'line_items[0][price_data][unit_amount]': String(selected.amount),
    'line_items[0][price_data][product_data][name]': selected.name,
    'line_items[0][quantity]': '1',
    success_url: `${BASE_URL}${selected.next}?upsell=${encodeURIComponent(offer)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}${selected.next}`,
    'metadata[funnel]': '40-product-ads',
    'metadata[upsell]': offer
  });

  if (selected.mode === 'subscription') {
    params.append('line_items[0][price_data][recurring][interval]', selected.interval);
  }
  if (customer) params.append('customer', customer);
  else if (customerEmail) params.append('customer_email', customerEmail);

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers, body: params });
  const data = await stripeRes.json();
  if (!stripeRes.ok) throw new Error(data.error?.message || 'Failed to create upsell checkout');
  return data.url;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripeSecretKey = process.env.STRIPE_SECRET_API_KEY;
  if (!stripeSecretKey) return res.status(500).json({ error: 'Stripe secret key not configured' });

  const { offer, session_id, order = {} } = req.body || {};
  const selected = OFFERS[offer];
  if (!selected) return res.status(400).json({ error: 'Unknown upsell offer' });

  const headers = { Authorization: `Bearer ${stripeSecretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' };

  try {
    let customer = '';
    let customerEmail = order.customer?.email || '';
    let paymentMethod = '';
    if (session_id) {
      const sessionRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}?expand[0]=payment_intent`, { headers });
      const session = await sessionRes.json();
      if (sessionRes.ok) {
        customer = session.customer || '';
        customerEmail = session.customer_details?.email || customerEmail;
        paymentMethod = session.payment_intent?.payment_method || '';
      }
    }

    if (selected.mode === 'payment' && customer && paymentMethod) {
      const piParams = new URLSearchParams({
        amount: String(selected.amount),
        currency: 'gbp',
        customer,
        payment_method: paymentMethod,
        off_session: 'true',
        confirm: 'true',
        description: selected.name,
        'metadata[funnel]': '40-product-ads',
        'metadata[upsell]': offer
      });
      piParams.append('payment_method_types[]', 'card');

      const piRes = await fetch('https://api.stripe.com/v1/payment_intents', { method: 'POST', headers, body: piParams });
      const pi = await piRes.json();
      if (piRes.ok && pi.status === 'succeeded') {
        return res.status(200).json({ success: true, payment_intent: pi.id });
      }
    }

    const url = await createHostedCheckout({ headers, selected, offer, customer, customerEmail });
    return res.status(200).json({ success: false, url });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
