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

  const { setup_intent_id } = req.body || {};

  if (!setup_intent_id) {
    return res.status(400).json({ error: 'Missing setup_intent_id' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_API_KEY;
  const webhookUrl = 'https://services.leadconnectorhq.com/hooks/u3QaT76YAw3PJvfiuGkZ/webhook-trigger/7b8a9c64-30a8-4408-807b-ee6942370481';

  if (!stripeSecretKey) {
    return res.status(500).json({ error: 'Stripe secret key not configured' });
  }

  const stripeHeaders = {
    'Authorization': `Bearer ${stripeSecretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

    try {
        // Retrieve the confirmed SetupIntent to get the saved payment method + customer
        const setupRes = await fetch(`https://api.stripe.com/v1/setup_intents/${setup_intent_id}`, {
            headers: stripeHeaders,
        });
        const setup = await setupRes.json();
        if (!setupRes.ok) {
            return res.status(400).json({ error: setup.error?.message || 'Failed to retrieve setup intent' });
        }

        if (setup.status !== 'succeeded') {
            return res.status(400).json({ error: 'Payment method was not confirmed' });
        }

        const paymentMethodId = setup.payment_method;
        const customerId = setup.customer;

        // Get the customer email for the webhook + tracking
        let customerEmail = setup.customer_details?.email || '';
        if (!customerEmail && customerId) {
            const custRes = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
                headers: stripeHeaders,
            });
            const cust = await custRes.json();
            if (custRes.ok && cust.email) customerEmail = cust.email;
        }

        // Create the price first with product_data (allowed for /v1/prices, not inside /v1/subscriptions)
        const priceParams = new URLSearchParams({
            currency: 'usd',
            unit_amount: '900',
            'recurring[interval]': 'month',
            'product_data[name]': 'CR8OR AI Video Studio Subscription',
            'product_data[metadata][source]': 'ai-video-studio-checkout',
        });

        const priceRes = await fetch('https://api.stripe.com/v1/prices', {
            method: 'POST',
            headers: stripeHeaders,
            body: priceParams,
        });
        const price = await priceRes.json();
        if (!priceRes.ok) {
            return res.status(400).json({ error: price.error?.message || 'Failed to create price' });
        }

        // Create the $9/month subscription with the saved payment method
        const subParams = new URLSearchParams({
            customer: customerId,
            default_payment_method: paymentMethodId,
            off_session: 'true',
            'items[0][price]': price.id,
            'items[0][quantity]': '1',
            'expand[0]': 'latest_invoice.payment_intent',
        });

        const subRes = await fetch('https://api.stripe.com/v1/subscriptions', {
            method: 'POST',
            headers: stripeHeaders,
            body: subParams,
        });
        const sub = await subRes.json();

    if (!subRes.ok) {
      return res.status(400).json({ error: sub.error?.message || 'Failed to create subscription' });
    }

    const invoice = sub.latest_invoice;
    const paymentStatus = invoice?.payment_intent?.status || 'unknown';

    if (paymentStatus === 'requires_action' || paymentStatus === 'requires_payment_method') {
      return res.status(400).json({
        error: 'Payment requires additional authentication',
        requires_action: true,
        subscription_id: sub.id,
      });
    }

    // Fire lead to webhook (non-blocking, don't fail checkout if webhook fails)
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: customerEmail,
        source: 'ai-video-studio-sales',
        subscription_id: sub.id,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      subscription_id: sub.id,
      customer_id: customerId,
      payment_status: paymentStatus,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
