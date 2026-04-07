/* ===================================
   Netlify Function: upload-order-photo
   注文写真のDB更新 + 管理者通知
   =================================== */

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event) => {
  // CORS対応
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const { session_id, photo_path } = JSON.parse(event.body);

    if (!session_id || !photo_path) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'session_id and photo_path are required' }) };
    }

    // session_id で注文を取得
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, order_number, customer_email')
      .eq('stripe_session_id', session_id)
      .single();

    if (fetchError || !order) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Order not found' }) };
    }

    // photo_url を更新
    const { error: updateError } = await supabase
      .from('orders')
      .update({ photo_url: photo_path })
      .eq('id', order.id);

    if (updateError) {
      console.error('Photo URL update error:', updateError);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to update order' }) };
    }

    // 管理者に通知メール
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const adminEmails = adminEmail.split(',').map(e => e.trim()).filter(Boolean);
      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'noreply@whitesnowpaws.jp',
          to: adminEmails,
          subject: `【写真受信】${order.order_number} - ウッドバーニング用写真が届きました`,
          text: `注文 ${order.order_number} の写真が届きました。

お客様メール: ${order.customer_email}
写真パス: ${photo_path}

Supabase ダッシュボード > Storage > order-photos で確認できます。
`,
        });
      } catch (emailErr) {
        console.error('Admin photo notification error:', emailErr);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, order_number: order.order_number }),
    };
  } catch (err) {
    console.error('Upload order photo error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
