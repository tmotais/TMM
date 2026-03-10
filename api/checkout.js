export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { productId, productName, price, currency = 'cad' } = req.body;

  const params = new URLSearchParams({
    'payment_method_types[]': 'card',
    'line_items[0][price_data][currency]': currency,
    'line_items[0][price_data][product_data][name]': productName,
    'line_items[0][price_data][unit_amount]': Math.round(price * 100),
    'line_items[0][quantity]': '1',
    'mode': 'payment',
    'success_url': `https://thibaultmotais.com/success?product=${encodeURIComponent(productName)}`,
    'cancel_url': `https://thibaultmotais.com/#store`,
    'metadata[product_id]': productId,
  });

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();
    if (!stripeRes.ok) throw new Error(session.error?.message || 'Stripe error');

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
