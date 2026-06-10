/* ===================================
   Netlify Function: contact-submit
   お問い合わせフォーム受信 → 管理者へ通知 + お客様へ自動返信
   =================================== */

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const INQUIRY_LABELS = {
  order: '商品のご注文について',
  custom: 'リード3m以上のご相談',
  size: 'サイズ・素材について',
  delivery: '配送・お届けについて',
  return: '返品・交換について',
  other: 'その他',
};

function esc(s) {
  return String(s || '').replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

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

  const { lastName, firstName, email, phone, inquiryType, message } = body;

  // バリデーション
  if (!lastName || !firstName || !email || !inquiryType || !message) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: '必須項目が不足しています' }),
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'メールアドレスの形式が正しくありません' }),
    };
  }
  if (message.length > 5000) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'お問い合わせ内容が長すぎます' }),
    };
  }

  const customerName = `${lastName} ${firstName}`;
  const typeLabel = INQUIRY_LABELS[inquiryType] || inquiryType;
  const receivedAt = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminEmails = adminEmail
    ? adminEmail.split(',').map((e) => e.trim()).filter(Boolean)
    : [];
  const fromAddr = process.env.EMAIL_FROM || 'noreply@whitesnowpaws.jp';

  try {
    // 1) 管理者へ通知
    if (adminEmails.length) {
      await resend.emails.send({
        from: fromAddr,
        to: adminEmails,
        replyTo: email,
        subject: `【お問い合わせ】${typeLabel} - ${customerName} 様`,
        text: `White Snow Paws へお問い合わせがありました。

受信日時: ${receivedAt}

■ お客様情報
お名前: ${customerName}
メール: ${email}
電話番号: ${phone || '（未入力）'}

■ お問い合わせ種類
${typeLabel}

■ お問い合わせ内容
${message}

---
このメールに直接返信するとお客様（${email}）に返信されます。
`,
      });
    }

    // 2) お客様へ自動返信
    await resend.emails.send({
      from: fromAddr,
      to: email,
      subject: '【White Snow Paws】お問い合わせを受け付けました',
      text: `${customerName} 様

この度は White Snow Paws へお問い合わせいただき、誠にありがとうございます。
下記の内容でお問い合わせを受け付けました。

------------------------------
お問い合わせ種類: ${typeLabel}

お問い合わせ内容:
${message}
------------------------------

担当者より2〜3営業日以内にご返信いたします。
今しばらくお待ちくださいませ。

なお、このメールは自動返信です。
ご返信いただいてもお返事できかねますのでご了承ください。

White Snow Paws
whitesnowpaws.jp
`,
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('Contact submit error:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message || 'メール送信に失敗しました' }),
    };
  }
};
