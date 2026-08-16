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

  const { email } = req.body || {};

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_API_KEY;
  const webhookUrl = 'https://services.leadconnectorhq.com/hooks/u3QaT76YAw3PJvfiuGkZ/webhook-trigger/7b8a9c64-30a8-4408-807b-ee6942370481';

  if (!stripeSecretKey) {
    return res.status(500).json({ error: 'Stripe secret key not configured' });
  }

  try {
    // Fire lead to webhook (non-blocking, don't fail checkout if webhook fails)
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'ai-video-studio-sales', timestamp: new Date().toISOString() })
    }).catch(() => {});

    // Create Stripe checkout session
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

    params.append('customer_email', email);

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
