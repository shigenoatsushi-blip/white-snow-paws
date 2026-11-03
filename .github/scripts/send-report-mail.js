// 月次レポートのPDFを重野さん本人あてにGmailで送る（確認してから遠田様へ転送する運用）
// 必要な設定:
//   GMAIL_USER / GMAIL_APP_PASSWORD … 送信に使うGmailとアプリパスワード（宛先も同じアドレス）
//   REPORT_PROFILE                 … 宛名・差出人名（転送用文面に使う）
// nodemailer はワークフロー内で一時的に入れる（package.json には入れない）

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const OUT_DIR = path.join(__dirname, '..', '..', '_reports');

async function main() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD が未設定です');
  const profile = JSON.parse(process.env.REPORT_PROFILE || '{}');

  const pdf = fs.readdirSync(OUT_DIR).find((f) => /^report-\d{6}\.pdf$/.test(f));
  if (!pdf) throw new Error('PDFが見つかりません');
  const ym = pdf.match(/(\d{4})(\d{2})/);
  const label = `${ym[1]}年${Number(ym[2])}月`;

  const text = `重野さん

WSP 月次アクセス解析レポート（${label}分）を自動作成しました。PDFを添付しています。
内容を確認して、問題なければ下の文面で${profile.client || ''}様へ転送してください。

■ 送る前のチェック
・数字が極端におかしくないか（0ばかり／前月から何倍も増減 など）
・海外（特にアメリカ）の人数が多い月は、ロボットによる自動アクセスの可能性があります
・⑥所見は数字から組み立てた定型文です。直したいときは Claude に「${Number(ym[2])}月分のレポートを仕上げて」と伝えてください

---------- 転送用の文面（ここから下をコピー） ----------

${profile.client || ''}様

いつもお世話になっております。ONTECHの${(profile.name || '').split(' ')[0]}です。
${label}分のアクセス解析レポートをお送りいたします（PDFを添付しております）。
ご不明な点などございましたら、お気軽にお申し付けください。
今後ともどうぞよろしくお願い申し上げます。

${profile.name || ''}

---------- ここまで ----------

※ このメールは GitHub Actions から自動送信しています。
`;

  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  await transporter.sendMail({
    from: user,
    to: user,
    subject: `【要確認】WSP月次レポート ${label}（自動作成）`,
    text,
    attachments: [{ filename: `WhiteSnowPaws_アクセス解析レポート_${label}.pdf`, path: path.join(OUT_DIR, pdf) }],
  });
  console.log(`送信しました: ${pdf}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
