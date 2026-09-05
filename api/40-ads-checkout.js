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

  const stripeSecretKey = process.env.STRIPE_SECRET_API_KEY_TEST;
  const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY_TEST;
  if (!stripeSecretKey) return res.status(500).json({ error: 'Stripe test secret key not configured' });
  if (!stripePublishableKey) return res.status(500).json({ error: 'Stripe test publishable key not configured' });

  const { customer = {}, strategyReport = false, utm = {} } = req.body || {};
  if (!customer.email || !String(customer.email).includes('@')) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  try {
    const stripeHeaders = { Authorization: `Bearer ${stripeSecretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' };
    const customerParams = new URLSearchParams({
      email: customer.email,
      'metadata[funnel]': '40-product-ads'
    });
    const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
    const phone = [customer.countryCode, customer.telephone].filter(Boolean).join(' ');
    if (name) customerParams.append('name', name);
    if (phone) customerParams.append('phone', phone);
    appendMetadata(customerParams, 'customer', customer);
    appendMetadata(customerParams, 'utm', utm);

    const customerRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: stripeHeaders,
      body: customerParams
    });
    const stripeCustomer = await customerRes.json();
    if (!customerRes.ok) return res.status(400).json({ error: stripeCustomer.error?.message || 'Failed to create Stripe customer' });

    const amount = strategyReport ? 4600 : 2700;
    const paymentParams = new URLSearchParams({
      amount: String(amount),
      currency: 'gbp',
      customer: stripeCustomer.id,
      receipt_email: customer.email,
      description: strategyReport ? '40 Product Ad Variations + Creative Strategy Report' : '40 Product Ad Variations',
      setup_future_usage: 'off_session',
      'automatic_payment_methods[enabled]': 'true',
      'metadata[funnel]': '40-product-ads',
      'metadata[stripe_mode]': 'test',
      'metadata[product]': '40-product-ad-variations',
      'metadata[strategy_report]': strategyReport ? 'yes' : 'no'
    });
    appendMetadata(paymentParams, 'customer', customer);
    appendMetadata(paymentParams, 'utm', utm);

    const paymentRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: stripeHeaders,
      body: paymentParams
    });
    const payment = await paymentRes.json();
    if (!paymentRes.ok) return res.status(400).json({ error: payment.error?.message || 'Failed to create payment intent' });

    return res.status(200).json({
      publishable_key: stripePublishableKey,
      client_secret: payment.client_secret,
      payment_intent_id: payment.id,
      customer_id: stripeCustomer.id,
      amount,
      mode: 'test'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
