/* ===================================
   Netlify Function: create-checkout-session
   Stripe Checkout セッションを作成してURLを返す
   =================================== */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  // CORS プリフライト対応
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { cart, shipping, userId, invoiceRequested } = body;

  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'カートが空です' }) };
  }
  if (!shipping || !shipping.email) {
    return { statusCode: 400, body: JSON.stringify({ error: '配送情報が不足しています' }) };
  }

  // 送料計算: 3点以上は¥900 (佐川急便) / 北海道+¥300・沖縄+¥600
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const qty = cart.reduce((sum, item) => sum + item.quantity, 0);
  let shippingFee = qty >= 3 ? 900 : 0;
  if (shipping.prefecture === '北海道') shippingFee += 300;
  if (shipping.prefecture === '沖縄県') shippingFee += 600;

  const siteUrl = process.env.SITE_URL || 'http://localhost:8888';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      locale: 'ja',
      customer_email: shipping.email,
      line_items: [
        ...cart.map((item) => {
          const descParts = [];
          if (item.color) descParts.push(`カラー: ${item.color}`);
          if (item.length) descParts.push(`長さ: ${item.length}`);
          if (item.options && item.options.karabina) descParts.push('カラビナ変更');
          return {
            price_data: {
              currency: 'jpy',
              product_data: {
                name: item.name,
                description: descParts.length ? descParts.join(' / ') : undefined,
              },
              unit_amount: item.price,
            },
            quantity: item.quantity,
          };
        }),
        // 送料
        ...(shippingFee > 0
          ? [
              {
                price_data: {
                  currency: 'jpy',
                  product_data: { name: '送料' },
                  unit_amount: shippingFee,
                },
                quantity: 1,
              },
            ]
          : []),
      ],
      metadata: {
        cart: JSON.stringify(cart),
        shipping: JSON.stringify(shipping),
        user_id: userId || '',
        subtotal: String(subtotal),
        shipping_fee: String(shippingFee),
        invoice_requested: invoiceRequested ? 'true' : 'false',
      },
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cancel.html`,
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe error:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
