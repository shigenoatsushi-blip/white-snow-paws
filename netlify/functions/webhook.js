/* ===================================
   Netlify Function: webhook
   Stripe Webhook を受け取り注文を保存 + メール送信
   =================================== */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    await handleCheckoutComplete(session);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

async function handleCheckoutComplete(session) {
  const meta = session.metadata || {};
  let cart = [];
  let shipping = {};

  try {
    cart = JSON.parse(meta.cart || '[]');
    shipping = JSON.parse(meta.shipping || '{}');
  } catch (e) {
    console.error('Failed to parse metadata:', e);
    return;
  }

  const subtotal = parseInt(meta.subtotal || '0', 10);
  const shippingFee = parseInt(meta.shipping_fee || '0', 10);
  const total = subtotal + shippingFee;
  const userId = meta.user_id || null;

  // 注文番号生成（WSP-YYYYMMDD-XXXXX）
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const orderNumber = `WSP-${datePart}-${rand}`;

  // orders テーブルに挿入
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: orderNumber,
      user_id: userId || null,
      stripe_session_id: session.id,
      status: 'paid',
      customer_email: session.customer_email || shipping.email,
      shipping_last_name: shipping.lastName,
      shipping_first_name: shipping.firstName,
      shipping_postal: shipping.postal,
      shipping_prefecture: shipping.prefecture,
      shipping_city: shipping.city,
      shipping_address: shipping.address,
      shipping_phone: shipping.phone,
      remarks: shipping.remarks || '',
      subtotal,
      shipping_fee: shippingFee,
      total,
    })
    .select()
    .single();

  if (orderError) {
    console.error('Order insert error:', orderError);
    return;
  }

  // order_items テーブルに挿入
  const items = cart.map((item) => ({
    order_id: order.id,
    product_id: item.id || '',
    product_name: item.name,
    color: item.color || '',
    price: item.price,
    quantity: item.quantity,
  }));

  const { error: itemsError } = await supabase.from('order_items').insert(items);
  if (itemsError) {
    console.error('Order items insert error:', itemsError);
  }

  // 顧客確認メール送信
  await sendCustomerEmail(order, cart, shipping);

  // 管理者通知メール送信
  await sendAdminEmail(order, cart, shipping);
}

async function sendCustomerEmail(order, cart, shipping) {
  const itemsHtml = cart
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">${item.name}${item.color ? ` (${item.color})` : ''}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">¥${item.price.toLocaleString()}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">¥${(item.price * item.quantity).toLocaleString()}</td>
        </tr>`
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Noto Sans JP',sans-serif;color:#3C3228;max-width:600px;margin:0 auto;padding:20px;">
  <h1 style="font-size:20px;text-align:center;border-bottom:2px solid #D4C4B0;padding-bottom:16px;">
    ご注文ありがとうございます ✦ White Snow Paws
  </h1>
  <p>${shipping.lastName} ${shipping.firstName} 様</p>
  <p>ご注文を受け付けました。商品の準備が整い次第、発送いたします。</p>
  <p><strong>注文番号: ${order.order_number}</strong></p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <thead>
      <tr style="background:#F5EDE3;">
        <th style="padding:8px;text-align:left;">商品名</th>
        <th style="padding:8px;text-align:right;">単価</th>
        <th style="padding:8px;text-align:center;">数量</th>
        <th style="padding:8px;text-align:right;">小計</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <p style="text-align:right;">小計: ¥${order.subtotal.toLocaleString()}</p>
  <p style="text-align:right;">送料: ¥${order.shipping_fee.toLocaleString()}</p>
  <p style="text-align:right;font-size:18px;font-weight:bold;">合計: ¥${order.total.toLocaleString()}</p>
  <hr style="border:1px solid #D4C4B0;">
  <h2 style="font-size:16px;">お届け先</h2>
  <p>${shipping.lastName} ${shipping.firstName}<br>
  〒${shipping.postal} ${shipping.prefecture}${shipping.city}${shipping.address}<br>
  TEL: ${shipping.phone}</p>
  <hr style="border:1px solid #D4C4B0;">
  <p style="font-size:12px;color:#7A6B5D;">
    ご不明な点はお気軽にお問い合わせください。<br>
    White Snow Paws | 新潟県十日町市
  </p>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@whitesnowpaws.jp',
      to: order.customer_email,
      subject: `【White Snow Paws】ご注文確認 ${order.order_number}`,
      html,
    });
  } catch (err) {
    console.error('Customer email error:', err);
  }
}

async function sendAdminEmail(order, cart, shipping) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  // 複数の管理者メールアドレスに送信（カンマ区切りで設定可能）
  const adminEmails = adminEmail.split(',').map(e => e.trim()).filter(Boolean);

  const itemsList = cart
    .map((item) => `・${item.name}${item.color ? ` (${item.color})` : ''} × ${item.quantity} = ¥${(item.price * item.quantity).toLocaleString()}`)
    .join('\n');

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@whitesnowpaws.jp',
      to: adminEmails,
      subject: `【新規注文】${order.order_number} - ¥${order.total.toLocaleString()}`,
      text: `新規注文が入りました。

注文番号: ${order.order_number}
お客様: ${shipping.lastName} ${shipping.firstName}
メール: ${order.customer_email}
合計: ¥${order.total.toLocaleString()}

【注文内容】
${itemsList}

【お届け先】
〒${shipping.postal} ${shipping.prefecture}${shipping.city}${shipping.address}
TEL: ${shipping.phone}
`,
    });
  } catch (err) {
    console.error('Admin email error:', err);
  }
}
