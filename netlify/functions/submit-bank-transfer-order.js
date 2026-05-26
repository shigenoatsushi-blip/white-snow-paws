/* ===================================
   Netlify Function: submit-bank-transfer-order
   銀行振込注文を受け付けて Supabase に保存 + メール送信
   =================================== */

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const BANK_INFO = {
  bankName: '大光銀行',
  branchName: '十日町支店',
  accountType: '普通',
  accountNumber: '3551258',
  accountHolder: 'カ）ユウキコウギヨウ',
};

exports.handler = async (event) => {
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

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const qty = cart.reduce((sum, item) => sum + item.quantity, 0);
  let shippingFee = qty >= 3 ? 900 : 0;
  if (shipping.prefecture === '北海道') shippingFee += 300;
  if (shipping.prefecture === '沖縄県') shippingFee += 600;
  const total = subtotal + shippingFee;

  // 注文番号
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const orderNumber = `WSP-${datePart}-${rand}`;

  // orders 挿入
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: orderNumber,
      user_id: userId || null,
      stripe_session_id: null,
      status: 'awaiting_payment',
      payment_method: 'bank_transfer',
      customer_email: shipping.email,
      shipping_last_name: shipping.lastName,
      shipping_first_name: shipping.firstName,
      shipping_last_kana: shipping.lastKana || '',
      shipping_first_kana: shipping.firstKana || '',
      shipping_postal: shipping.postal,
      shipping_prefecture: shipping.prefecture,
      shipping_city: shipping.city,
      shipping_address: shipping.address,
      shipping_phone: shipping.phone,
      remarks: shipping.remarks || '',
      subtotal,
      shipping_fee: shippingFee,
      total,
      invoice_requested: !!invoiceRequested,
    })
    .select()
    .single();

  if (orderError) {
    console.error('Order insert error:', orderError);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: orderError.message }),
    };
  }

  // order_items
  const items = cart.map((item) => ({
    order_id: order.id,
    product_id: item.id || '',
    product_name: item.name,
    color: item.color || '',
    price: item.price,
    quantity: item.quantity,
  }));
  await supabase.from('order_items').insert(items);

  await sendCustomerEmail(order, cart, shipping);
  await sendAdminEmail(order, cart, shipping, invoiceRequested);

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      order_number: orderNumber,
      total,
    }),
  };
};

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
    ご注文ありがとうございます White Snow Paws
  </h1>
  <p>${shipping.lastName} ${shipping.firstName} 様</p>
  <p>銀行振込でのご注文を受け付けました。下記の口座へお振込みをお願いいたします。</p>
  <p><strong>注文番号: ${order.order_number}</strong></p>

  <h2 style="font-size:16px;margin-top:24px;background:#F5EDE3;padding:8px 12px;">お振込先</h2>
  <table style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
    <tr><td style="padding:6px 8px;color:#7A6B5D;width:120px;">銀行名</td><td style="padding:6px 8px;font-weight:bold;">${BANK_INFO.bankName}</td></tr>
    <tr><td style="padding:6px 8px;color:#7A6B5D;">支店名</td><td style="padding:6px 8px;font-weight:bold;">${BANK_INFO.branchName}</td></tr>
    <tr><td style="padding:6px 8px;color:#7A6B5D;">口座種別</td><td style="padding:6px 8px;font-weight:bold;">${BANK_INFO.accountType}</td></tr>
    <tr><td style="padding:6px 8px;color:#7A6B5D;">口座番号</td><td style="padding:6px 8px;font-weight:bold;">${BANK_INFO.accountNumber}</td></tr>
    <tr><td style="padding:6px 8px;color:#7A6B5D;">口座名義</td><td style="padding:6px 8px;font-weight:bold;">${BANK_INFO.accountHolder}</td></tr>
    <tr><td style="padding:6px 8px;color:#7A6B5D;">お振込金額</td><td style="padding:6px 8px;font-weight:bold;color:#C0392B;">¥${order.total.toLocaleString()}</td></tr>
  </table>
  <p style="font-size:13px;color:#7A6B5D;line-height:1.8;">
    ※ お振込人名義（カタカナ）: <strong>${(shipping.lastKana || '').toUpperCase()} ${(shipping.firstKana || '').toUpperCase()}</strong><br>
    ※ <strong>振込手数料はお客様ご負担</strong>でお願いいたします。<br>
    ※ ご入金確認後、発送準備に入らせていただきます。
  </p>

  <h2 style="font-size:16px;margin-top:24px;">ご注文内容</h2>
  <table style="width:100%;border-collapse:collapse;margin:8px 0;">
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
      subject: `【White Snow Paws】銀行振込のご案内 ${order.order_number}`,
      html,
    });
  } catch (err) {
    console.error('Customer email error:', err);
  }
}

async function sendAdminEmail(order, cart, shipping, invoiceRequested) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;
  const adminEmails = adminEmail.split(',').map(e => e.trim()).filter(Boolean);

  const itemsList = cart
    .map((item) => `・${item.name}${item.color ? ` (${item.color})` : ''} × ${item.quantity} = ¥${(item.price * item.quantity).toLocaleString()}`)
    .join('\n');

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@whitesnowpaws.jp',
      to: adminEmails,
      subject: `【新規注文・銀行振込】${order.order_number} - ¥${order.total.toLocaleString()}`,
      text: `新規注文(銀行振込)が入りました。入金待ち状態です。

注文番号: ${order.order_number}
お客様: ${shipping.lastName} ${shipping.firstName}
振込予定名義: ${shipping.lastName} ${shipping.firstName}（カナ: ${shipping.lastKana || ''} ${shipping.firstKana || ''}）
メール: ${order.customer_email}
電話: ${shipping.phone}
合計: ¥${order.total.toLocaleString()}

【注文内容】
${itemsList}

【お届け先】
〒${shipping.postal} ${shipping.prefecture}${shipping.city}${shipping.address}

【領収書】${invoiceRequested ? '同封希望あり ✓' : '希望なし'}

※ご入金確認後、Stripeダッシュボードもしくはオーダー管理画面で status を paid に更新してください。
`,
    });
  } catch (err) {
    console.error('Admin email error:', err);
  }
}
