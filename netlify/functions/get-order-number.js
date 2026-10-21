/* ===================================
   Netlify Function: get-order-number
   Stripe の session_id から注文番号だけを返す（success.html 用）
   ※ 住所等の個人情報は返さない。orders の匿名読み取りポリシーは使わない。
   =================================== */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sessionId = (event.queryStringParameters || {}).session_id || '';
  // Stripe Checkout の session_id 形式のみ受け付ける
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,}$/.test(sessionId)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid session_id' }) };
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('order_number')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();

  if (error) {
    console.error('get-order-number error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'lookup failed' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Cache-Control': 'no-store' },
    body: JSON.stringify({ order_number: order ? order.order_number : null }),
  };
};
