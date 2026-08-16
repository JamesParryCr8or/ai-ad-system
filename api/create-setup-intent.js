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

  if (!stripeSecretKey) {
    return res.status(500).json({ error: 'Stripe secret key not configured' });
  }

  const stripeHeaders = {
    'Authorization': `Bearer ${stripeSecretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  try {
    // Create the customer (or reuse logic is intentionally simple: new customer per email)
    const customerRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: stripeHeaders,
      body: new URLSearchParams({ email }),
    });
    const customer = await customerRes.json();
    if (!customerRes.ok) {
      return res.status(400).json({ error: customer.error?.message || 'Failed to create customer' });
    }

    // Create a Setup Intent that saves the payment method for off-session use
    const setupRes = await fetch('https://api.stripe.com/v1/setup_intents', {
      method: 'POST',
      headers: stripeHeaders,
      body: new URLSearchParams({
        customer: customer.id,
        usage: 'off_session',
        'payment_method_types[0]': 'card',
        'automatic_payment_methods[enabled]': 'true',
      }),
    });
    const setup = await setupRes.json();
    if (!setupRes.ok) {
      return res.status(400).json({ error: setup.error?.message || 'Failed to create setup intent' });
    }

    return res.status(200).json({
      publishable_key: process.env.STRIPE_PUBLISHABLE_KEY || '',
      client_secret: setup.client_secret,
      setup_intent_id: setup.id,
      customer_id: customer.id,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
