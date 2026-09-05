export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookUrl = process.env.CR8OR_40_ADS_WEBHOOK_URL
    || process.env.CR8OR_ORDER_WEBHOOK_URL
    || 'https://services.leadconnectorhq.com/hooks/u3QaT76YAw3PJvfiuGkZ/webhook-trigger/7b8a9c64-30a8-4408-807b-ee6942370481';
  const body = req.body || {};
  const payload = {
    source: '40-product-ads-funnel',
    timestamp: new Date().toISOString(),
    ...body
  };

  if (!webhookUrl) {
    console.log('[40-ads-webhook]', JSON.stringify(payload));
    return res.status(200).json({ ok: true, skipped: true });
  }

  try {
    const hookRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!hookRes.ok) return res.status(502).json({ error: 'Webhook rejected payload' });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
