const BASE_URL = process.env.CR8OR_FUNNEL_BASE_URL || 'https://scale.cr8or.ai';

function appendMetadata(params, prefix, value) {
  if (!value || typeof value !== 'object') return;
  Object.entries(value).forEach(([key, item]) => {
    if (item !== undefined && item !== null && item !== '') {
      params.append(`metadata[${prefix}_${key}]`, String(item).slice(0, 450));
    }
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripeSecretKey = process.env.STRIPE_SECRET_API_KEY;
  if (!stripeSecretKey) return res.status(500).json({ error: 'Stripe secret key not configured' });

  const { customer = {}, strategyReport = false, utm = {} } = req.body || {};
  if (!customer.email || !String(customer.email).includes('@')) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  const params = new URLSearchParams({
    mode: 'payment',
    customer_email: customer.email,
    customer_creation: 'always',
    billing_address_collection: 'required',
    'phone_number_collection[enabled]': 'true',
    'line_items[0][price_data][currency]': 'gbp',
    'line_items[0][price_data][unit_amount]': '2700',
    'line_items[0][price_data][product_data][name]': '40 Product Ad Variations',
    'line_items[0][price_data][product_data][description]': '10 creative concepts with four static ad variations each.',
    'line_items[0][quantity]': '1',
    success_url: `${BASE_URL}/40-ads/campaign-setup?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/40-ads/checkout`,
    'metadata[funnel]': '40-product-ads',
    'metadata[strategy_report]': strategyReport ? 'yes' : 'no'
  });

  if (strategyReport) {
    params.append('line_items[1][price_data][currency]', 'gbp');
    params.append('line_items[1][price_data][unit_amount]', '1900');
    params.append('line_items[1][price_data][product_data][name]', 'Creative Strategy Report');
    params.append('line_items[1][price_data][product_data][description]', 'Customer angles, hooks, objections, positioning and recommended testing order.');
    params.append('line_items[1][quantity]', '1');
  }

  appendMetadata(params, 'customer', customer);
  appendMetadata(params, 'utm', utm);

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeSecretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const data = await stripeRes.json();
    if (!stripeRes.ok) return res.status(400).json({ error: data.error?.message || 'Failed to create checkout session' });
    return res.status(200).json({ url: data.url, id: data.id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
