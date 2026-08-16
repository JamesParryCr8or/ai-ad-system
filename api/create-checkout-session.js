export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_API_KEY;

  if (!stripeSecretKey) {
    return res.status(500).json({ error: 'Stripe secret key not configured' });
  }

  try {
    const body = req.body || {};
    const customerEmail = body.customer_email || '';

    const params = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': '900',
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': 'CR8OR Studio Subscription',
      'line_items[0][quantity]': '1',
      'success_url': 'https://scale.cr8or.ai/Course/ai-video-studio?session_id={CHECKOUT_SESSION_ID}',
      'cancel_url': 'https://scale.cr8or.ai/Course/ai-video-studio-sales',
    });

    if (customerEmail) {
      params.append('customer_email', customerEmail);
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const data = await stripeRes.json();

    if (!stripeRes.ok) {
      return res.status(400).json({ error: data.error?.message || 'Failed to create checkout session' });
    }

    return res.status(200).json({ url: data.url });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
