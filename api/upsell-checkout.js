const CREDITS_PRODUCT_NAME = 'Bulk Discount | 50% Off Credits | CR8OR AI';
const CREDITS_UNIT_AMOUNT = 32500; // $325.00 — 5,000 credits at 50% off

async function ensureCreditsPrice(headers) {
  // Look for an existing product/price, create once if missing
  const listRes = await fetch(
    `https://api.stripe.com/v1/prices?active=true&limit=100&expand[0][]=data.product`,
    { headers }
  );
  const list = await listRes.json();

  if (listRes.ok && Array.isArray(list.data)) {
    const existing = list.data.find(
      p => p.unit_amount === CREDITS_UNIT_AMOUNT && p.product && p.product.name === CREDITS_PRODUCT_NAME
    );
    if (existing) return existing.id;
  }

  const productRes = await fetch('https://api.stripe.com/v1/products', {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      name: CREDITS_PRODUCT_NAME,
      description: '5,000 CR8OR credits at 50% off (one-time bulk pack)',
    }),
  });
  const product = await productRes.json();
  if (!productRes.ok) throw new Error(product.error?.message || 'Failed to create product');

  const priceRes = await fetch('https://api.stripe.com/v1/prices', {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      currency: 'usd',
      unit_amount: String(CREDITS_UNIT_AMOUNT),
      product: product.id,
    }),
  });
  const price = await priceRes.json();
  if (!priceRes.ok) throw new Error(price.error?.message || 'Failed to create price');

  return price.id;
}

async function createHostedCheckout({ headers, customerEmail, subscription_id, session_id, priceId }) {
  const fallbackParams = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'success_url': 'https://scale.cr8or.ai/Course/ai-video-studio?session_id={CHECKOUT_SESSION_ID}',
    'cancel_url': `https://scale.cr8or.ai/Course/ai-video-studio-success?${subscription_id ? 'sub_id=' + subscription_id : 'session_id=' + session_id}`,
  });

  if (customerEmail) {
    fallbackParams.append('customer_email', customerEmail);
  }

  const csRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers,
    body: fallbackParams,
  });
  const cs = await csRes.json();

  if (!csRes.ok) {
    throw new Error(cs.error?.message || 'Failed to create upsell checkout');
  }

  return cs.url;
}

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

  const { subscription_id, session_id } = req.body || {};

  if (!subscription_id && !session_id) {
    return res.status(400).json({ error: 'Missing subscription_id or session_id' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_API_KEY;
  const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';

  if (!stripeSecretKey) {
    return res.status(500).json({ error: 'Stripe secret key not configured' });
  }

  const stripeHeaders = {
    'Authorization': `Bearer ${stripeSecretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  try {
    let customerId = null;
    let customerEmail = '';
    let paymentMethodId = null;

    // 1. Resolve customer + saved payment method
    if (subscription_id) {
      const subRes = await fetch(
        `https://api.stripe.com/v1/subscriptions/${subscription_id}?expand[0]=latest_invoice.payment_intent`,
        { headers: stripeHeaders }
      );
      const sub = await subRes.json();
      if (!subRes.ok) {
        return res.status(400).json({ error: sub.error?.message || 'Failed to retrieve subscription' });
      }
      if (sub.status === 'incomplete' || sub.status === 'incomplete_expired' || sub.status === 'unpaid' || sub.status === 'canceled') {
        return res.status(400).json({ error: 'Subscription is not active' });
      }

      customerId = sub.customer;
      paymentMethodId = sub.default_payment_method || sub.latest_invoice?.payment_intent?.payment_method || null;

      if (customerId && !paymentMethodId) {
        const pmRes = await fetch(`https://api.stripe.com/v1/customers/${customerId}/payment_methods?type=card&limit=1`, {
          headers: stripeHeaders,
        });
        const pmList = await pmRes.json();
        if (pmRes.ok && pmList.data && pmList.data.length > 0) {
          paymentMethodId = pmList.data[0].id;
        }
      }

      if (customerId) {
        const custRes = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, { headers: stripeHeaders });
        const cust = await custRes.json();
        if (custRes.ok && cust.email) customerEmail = cust.email;
      }
    } else if (session_id) {
      const sessionRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}`, {
        headers: stripeHeaders,
      });
      const session = await sessionRes.json();
      if (!sessionRes.ok) {
        return res.status(400).json({ error: session.error?.message || 'Failed to retrieve session' });
      }
      if (session.payment_status !== 'paid') {
        return res.status(400).json({ error: 'Original payment not completed' });
      }

      customerId = session.customer;
      customerEmail = session.customer_details?.email || '';

      if (session.subscription) {
        const subRes = await fetch(
          `https://api.stripe.com/v1/subscriptions/${session.subscription}?expand[0]=latest_invoice.payment_intent`,
          { headers: stripeHeaders }
        );
        const sub = await subRes.json();
        if (subRes.ok) {
          paymentMethodId = sub.default_payment_method || sub.latest_invoice?.payment_intent?.payment_method || null;
        }
      }
    }

    // 1.5 The subscription/session payment method may be a "link" PM (Stripe Link),
    //     which a plain card PaymentIntent will reject. Always resolve an actual
    //     card-type payment method for off-session use.
    if (customerId) {
      let isCard = false;

      if (paymentMethodId) {
        const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${paymentMethodId}`, {
          headers: stripeHeaders,
        });
        const pm = await pmRes.json();
        isCard = pmRes.ok && pm.type === 'card';
      }

      if (!isCard) {
        const cardListRes = await fetch(`https://api.stripe.com/v1/customers/${customerId}/payment_methods?type=card&limit=1`, {
          headers: stripeHeaders,
        });
        const cardList = await cardListRes.json();
        paymentMethodId = (cardListRes.ok && cardList.data && cardList.data.length > 0) ? cardList.data[0].id : null;
      }
      console.log('[upsell] resolved payment method:', JSON.stringify({ customerId, paymentMethodId, isCard }));
    }

    // 2. One-click: attempt an off-session charge server-side.
    //    If the card needs 3DS, return the client_secret for inline authentication.
    if (paymentMethodId && customerId) {
      const piParams = new URLSearchParams({
        amount: String(CREDITS_UNIT_AMOUNT),
        currency: 'usd',
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: 'true',
        confirm: 'true',
        description: 'Bulk Discount | 50% Off Credits | CR8OR AI — 5,000 credits',
        'metadata[product]': 'cr8or-credits-5000',
        'metadata[offer]': 'bulk-discount-50pct',
      });

      const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: stripeHeaders,
        body: piParams,
      });
      const pi = await piRes.json();

      console.log('[upsell] PI attempt:', JSON.stringify({
        ok: piRes.ok,
        status: pi.status,
        has_client_secret: !!pi.client_secret,
        error: pi.error?.message || null,
        paymentMethodId,
        customerId,
      }));

      if (piRes.ok && pi.status === 'succeeded') {
        return res.status(200).json({
          success: true,
          payment_intent: pi.id,
          customer_email: customerEmail,
        });
      }

      if (piRes.ok && pi.status === 'requires_action' && pi.client_secret) {
        return res.status(200).json({
          success: false,
          requires_action: true,
          client_secret: pi.client_secret,
          publishable_key: stripePublishableKey,
        });
      }

      // Declined or other error — fall through to hosted checkout
    }

    // 3. Fallback: hosted Stripe checkout for the same offer
    const priceId = await ensureCreditsPrice(stripeHeaders);
    const url = await createHostedCheckout({
      headers: stripeHeaders,
      customerEmail,
      subscription_id,
      session_id,
      priceId,
    });

    return res.status(200).json({
      success: false,
      requires_action: true,
      url,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
