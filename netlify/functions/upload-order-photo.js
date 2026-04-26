/* ===================================
   Netlify Function: upload-order-photo
   ファイルをbase64で受け取り、Supabase Storageに保存（service_role使用）
   + orders.photo_url 更新 + 管理者通知
   =================================== */

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event) => {
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
    const { session_id, file_base64, file_name, file_type } = JSON.parse(event.body);

    if (!session_id || !file_base64 || !file_name) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'session_id, file_base64, file_name are required' }) };
    }

    // session_id で注文を取得
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, order_number, customer_email')
      .eq('stripe_session_id', session_id)
      .single();

    if (fetchError || !order) {
      console.error('Order not found for session_id:', session_id, fetchError);
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Order not found' }) };
    }

    // base64 → Buffer に変換
    const fileBuffer = Buffer.from(file_base64, 'base64');
    const ext = file_name.split('.').pop().toLowerCase();
    const filePath = `${session_id}/${Date.now()}.${ext}`;
    const contentType = file_type || 'image/jpeg';

    // Supabase Storage にアップロード（service_role = RLS無視）
    const { error: uploadError } = await supabase.storage
      .from('order-photos')
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to upload photo' }) };
    }

    // orders.photo_url を更新
    const { error: updateError } = await supabase
      .from('orders')
      .update({ photo_url: filePath })
      .eq('id', order.id);

    if (updateError) {
      console.error('Photo URL update error:', updateError);
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
ファイル名: ${file_name}

※ 写真は本メールに添付されています。ご確認ください。
※ 元データは Supabase Storage (order-photos/${filePath}) にも保存されています。
`,
          attachments: [
            {
              filename: file_name,
              content: fileBuffer,
            }
          ],
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
