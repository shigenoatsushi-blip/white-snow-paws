/* ===================================
   決済時の価格照合（通知のみ・決済は止めない）
   - ページから送られてきた単価が、正しい価格と一致するかを確認する
   - 合わないものがあれば PRICE_ALERT_EMAIL にだけ通知する
   - ここで何が起きても決済処理には影響させない（呼び出し側は await しても例外が出ない）

   ★ 商品ページの価格を変えたら、ここも必ず同じ値に直すこと
     （確認: node scripts/check-prices.js で全商品の一致をチェックできる）
   =================================== */

const KARABINA_PRICE = 1300; // カラビナ変更オプション（長さのあるリードのみ）

// id → 固定価格（数値） or 長さごとの価格（オブジェクト）
const PRICE_TABLE = {
  // BioThane リード
  '1':  { '1200mm': 3800, '1500mm': 4000, '2m': 4300, '3m': 4700 }, // 16mm
  '10': { '1200mm': 4200, '1500mm': 4400, '2m': 4700, '3m': 5100 }, // 19mm
  '2': 2480,  // ショートリード 60cm
  '3': 3980,  // ロングリード 3m
  // BioThane カラー（首輪）
  '4': 2600, '5': 2900, '6': 3100,
  '7': 3480,  // ハーネス
  '8': 4480,  // リード＋カラー セット
  '9': 4980,  // トレーニングリード 500cm
  // ウッドバーニング
  '11': 5500,
  // Polyester Webbing
  '20': { '1200mm': 3200, '1500mm': 3500 }, // リード
  '21': 2300, '22': 2500, '23': 2800,       // 首輪 S/M/L
  // フード（js/food-data.js と同じ）
  '30': 700, '31': 700, '32': 700, '33': 700, '34': 900,
};

/* 1商品の正しい単価を返す（判定できなければ null） */
function expectedPrice(item) {
  const entry = PRICE_TABLE[String(item.id)];
  if (entry == null) return null;
  if (typeof entry === 'number') return entry;
  const base = entry[item.length];
  if (base == null) return null;
  const karabina = item.options && item.options.karabina ? KARABINA_PRICE : 0;
  return base + karabina;
}

/* カートを照合して、合わない行の一覧を返す */
function findMismatches(cart) {
  const problems = [];
  (Array.isArray(cart) ? cart : []).forEach((item) => {
    const expected = expectedPrice(item || {});
    const qtyOk = Number.isInteger(item && item.quantity) && item.quantity >= 1 && item.quantity <= 99;
    if (expected === null) {
      problems.push({ item, expected: null, reason: '価格表にない商品・長さ' });
    } else if (item.price !== expected) {
      problems.push({ item, expected, reason: '単価が違う' });
    } else if (!qtyOk) {
      problems.push({ item, expected, reason: '数量が不正' });
    }
  });
  return problems;
}

/* 照合して、問題があれば通知メール。例外は外に出さない */
async function checkAndNotify(cart, context) {
  try {
    const problems = findMismatches(cart);
    if (problems.length === 0) return problems;

    const lines = problems.map((p) => {
      const it = p.item || {};
      const variant = [it.color, it.length, it.options && it.options.karabina ? 'カラビナ変更' : ''].filter(Boolean).join(' / ');
      return `・[${p.reason}] id=${it.id} ${it.name || ''}${variant ? ` (${variant})` : ''}\n` +
             `    送られてきた単価: ${it.price} / 正しい単価: ${p.expected === null ? '不明' : p.expected} / 数量: ${it.quantity}`;
    }).join('\n');

    console.warn('[price-check] mismatch', context, JSON.stringify(problems));

    const to = process.env.PRICE_ALERT_EMAIL;
    if (!to || !process.env.RESEND_API_KEY) return problems;

    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@whitesnowpaws.jp',
      to: to.split(',').map((e) => e.trim()).filter(Boolean),
      subject: '【要確認】価格が合わない注文がありました（White Snow Paws）',
      text: `決済時の価格照合で、正しい価格と合わない商品がありました。
決済は止めずにそのまま進めています。発送前に注文内容をご確認ください。

支払い方法: ${context.method}
お客様メール: ${context.email || '不明'}
${context.orderNumber ? `注文番号: ${context.orderNumber}\n` : ''}
【合わなかった商品】
${lines}

※ 商品ページの価格を変更した直後の場合は、netlify/functions/_shared/price-check.js の価格表の直し忘れの可能性があります。
`,
    });
    return problems;
  } catch (err) {
    console.error('[price-check] error (決済には影響なし):', err);
    return [];
  }
}

module.exports = { PRICE_TABLE, KARABINA_PRICE, expectedPrice, findMismatches, checkAndNotify };
