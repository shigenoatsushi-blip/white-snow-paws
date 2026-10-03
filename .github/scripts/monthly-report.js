// 月次アクセス解析レポート自動作成（GA4 Data API → 印刷用HTML）
// 使い方: node .github/scripts/monthly-report.js [YYYY-MM]   ※省略時は前月
// 必要な設定:
//   GA4_SA_KEY     … サービスアカウント鍵(JSON文字列)。ローカルでは _reports/ga-key.json でも可
//   REPORT_PROFILE … {propertyId, client, name, address, tel, logo} のJSON。ローカルでは _reports/profile.json でも可
// ※ 公開リポジトリのため、宛名・住所・電話・ロゴはコードに書かず上記設定から読み込む
// 出力: _reports/report-YYYYMM.html（コミットしない。Actionsでは成果物としてダウンロード）

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, '_reports');
const BASELINE = '2026-07'; // 7月を基準月とし、それより前とは比較しない

// ---------- 設定読み込み ----------
function loadJson(envName, file) {
  if (process.env[envName]) return JSON.parse(process.env[envName]);
  const p = path.join(OUT_DIR, file);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  throw new Error(`${envName} が未設定です（ローカルなら _reports/${file} を置いてください）`);
}

// ---------- 対象月 ----------
function jstNow() { return new Date(Date.now() + 9 * 3600 * 1000); }
function targetMonth() {
  const arg = process.argv[2] || process.env.REPORT_MONTH;
  if (arg) {
    if (!/^\d{4}-\d{2}$/.test(arg)) throw new Error('月は YYYY-MM 形式で指定してください');
    return arg;
  }
  const d = jstNow();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthInfo(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { ym, y, m, last, start: `${y}-${mm}-01`, end: `${y}-${mm}-${last}` };
}
function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// ---------- GA4 API ----------
async function getAccessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${unsigned}.${sig}`,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error('GA4の認証に失敗しました: ' + JSON.stringify(json));
  return json.access_token;
}

function makeRunner(token, propertyId) {
  return async function run(mi, dims, mets, opts = {}) {
    const body = {
      dateRanges: [{ startDate: mi.start, endDate: mi.end }],
      dimensions: dims.map((name) => ({ name })),
      metrics: mets.map((name) => ({ name })),
      limit: opts.limit || 1000,
    };
    if (dims.length) body.orderBys = [{ metric: { metricName: mets[0] }, desc: true }];
    if (opts.filter) body.dimensionFilter = opts.filter;
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.error) throw new Error('GA4 API エラー: ' + JSON.stringify(json.error));
    return (json.rows || []).map((r) => ({
      d: (r.dimensionValues || []).map((v) => v.value),
      m: r.metricValues.map((v) => Number(v.value)),
    }));
  };
}

async function fetchMonth(run, mi) {
  const [totalsRows, channels, sources, pagesRaw, countries, cities] = await Promise.all([
    run(mi, [], ['totalUsers', 'sessions', 'screenPageViews', 'eventCount', 'keyEvents']),
    run(mi, ['sessionDefaultChannelGroup'], ['sessions']),
    run(mi, ['firstUserSource', 'firstUserMedium'], ['totalUsers'], { limit: 7 }),
    run(mi, ['pagePath'], ['screenPageViews']),
    run(mi, ['countryId', 'country'], ['totalUsers'], { limit: 5 }),
    run(mi, ['city', 'region'], ['totalUsers'], {
      limit: 10,
      filter: { filter: { fieldName: 'countryId', stringFilter: { value: 'JP' } } },
    }),
  ]);
  const t = (totalsRows[0] || { m: [0, 0, 0, 0, 0] }).m;
  return {
    totals: { users: t[0], sessions: t[1], views: t[2], events: t[3], keyEvents: t[4] },
    channels: channels.map((r) => ({ name: r.d[0], value: r.m[0] })),
    sources: sources.map((r) => ({ source: r.d[0], medium: r.d[1], value: r.m[0] })),
    pages: aggregatePages(pagesRaw),
    countries: countries.map((r) => ({ id: r.d[0], name: r.d[1], value: r.m[0] })),
    cities: cities.filter((r) => r.d[0] !== '(not set)').slice(0, 6)
      .map((r) => ({ city: r.d[0], region: r.d[1], value: r.m[0] })),
  };
}

// ---------- 日本語ラベル ----------
const CHANNEL_LABELS = {
  'Organic Social': ['SNS', 'Instagram・Threads など'],
  'Direct': ['直接アクセス', 'URL入力・ブックマーク'],
  'Organic Shopping': ['Google ショッピング', 'ショッピング枠から'],
  'Organic Search': ['検索', 'Google などの検索'],
  'Referral': ['他サイトのリンク', 'ブログ・外部サイトなど'],
  'Organic Video': ['動画', 'YouTube など'],
  'Email': ['メール', 'メール内のリンク'],
  'Paid Social': ['SNS広告', ''],
  'Paid Search': ['検索広告', ''],
  'Unassigned': ['分類不明', '計測上、判定できないもの'],
};
function channelLabel(name) {
  if (/^ai/i.test(name)) return ['AI アシスタント', 'ChatGPT など'];
  return CHANNEL_LABELS[name] || [name, ''];
}
const isAiSource = (s) => /chatgpt|openai|perplexity|gemini|copilot|claude/i.test(s);

function sourceInfo(source, medium) {
  const label = source === '(direct)' ? '(direct)' : medium === 'referral' ? source : `${source} / ${medium}`;
  let desc = '外部サイトから';
  if (source === '(direct)') desc = 'URL直接入力・ブックマークなど';
  else if (/^ig$|instagram/i.test(source)) desc = source === 'ig' ? 'Instagram 本体' : 'Instagram のリンク経由';
  else if (/threads/i.test(source)) desc = 'Threads から';
  else if (/facebook|fb/i.test(source)) desc = 'Facebook から';
  else if (/google/i.test(source)) desc = medium === 'organic' ? 'Google 検索から' : 'Google から';
  else if (/yahoo/i.test(source)) desc = 'Yahoo! 検索から';
  else if (/bing/i.test(source)) desc = 'Bing 検索から';
  else if (/stripe/i.test(source)) desc = '決済ページからの再訪問';
  else if (isAiSource(source)) desc = 'AI 経由の流入';
  return { label, desc };
}

const PAGE_LABELS = {
  '/': 'トップページ',
  '/biothane-lead': 'BioThane リード（商品）',
  '/biothane-collar': 'BioThane カラー（商品）',
  '/product-detail': '商品詳細',
  '/woodburning': 'ウッドバーニング',
  '/cart': 'カート',
  '/checkout': 'ご注文手続き',
  '/checkout-confirm': 'ご注文内容の確認',
  '/success': 'ご注文完了',
  '/order-complete': 'ご注文完了',
  '/bank-transfer-success': 'お振込みご注文完了',
  '/story': 'ストーリー',
  '/faq': 'よくある質問',
  '/contact': 'お問い合わせ',
  '/shipping': '配送について',
  '/login': 'ログイン',
  '/register': '会員登録',
  '/mypage': 'マイページ',
  '/privacy': 'プライバシーポリシー',
  '/terms': '利用規約',
  '/tradelaw': '特定商取引法に基づく表記',
  '/cancel': '決済キャンセル',
};
const PRODUCT_PAGES = ['/biothane-lead', '/biothane-collar', '/product-detail'];

function normalizePath(p) {
  let s = p.split('?')[0].split('#')[0].replace(/\.html$/, '').replace(/\/+$/, '');
  if (s === '' || s === '/index') s = '/';
  return s;
}
function aggregatePages(rows) {
  const map = {};
  for (const r of rows) {
    const k = normalizePath(r.d[0]);
    map[k] = (map[k] || 0) + r.m[0];
  }
  return map;
}

const COUNTRY_JA = {
  JP: '日本', US: 'アメリカ', DE: 'ドイツ', PL: 'ポーランド', SK: 'スロバキア', CN: '中国', KR: '韓国',
  TW: '台湾', HK: '香港', GB: 'イギリス', FR: 'フランス', CA: 'カナダ', AU: 'オーストラリア',
  SG: 'シンガポール', TH: 'タイ', VN: 'ベトナム', PH: 'フィリピン', ID: 'インドネシア', IN: 'インド',
  NL: 'オランダ', IT: 'イタリア', ES: 'スペイン', BR: 'ブラジル', MX: 'メキシコ', IE: 'アイルランド',
  SE: 'スウェーデン', CH: 'スイス', MY: 'マレーシア', NZ: 'ニュージーランド', FI: 'フィンランド',
  CZ: 'チェコ', AT: 'オーストリア', BE: 'ベルギー', DK: 'デンマーク', NO: 'ノルウェー', '(not set)': '不明',
};
const flag = (id) => /^[A-Z]{2}$/.test(id) ? String.fromCodePoint(...[...id].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐';

const CITY_JA = {
  Tokamachi: '十日町市', Niigata: '新潟市', Nagaoka: '長岡市', Joetsu: '上越市', Kashiwazaki: '柏崎市',
  Ojiya: '小千谷市', Uonuma: '魚沼市', Minamiuonuma: '南魚沼市', Sanjo: '三条市', Tsubame: '燕市',
  Shibata: '新発田市', Myoko: '妙高市', Itoigawa: '糸魚川市', Azumino: '安曇野市', Matsumoto: '松本市',
  Nagano: '長野市', Shinjuku: '新宿区', Shibuya: '渋谷区', Minato: '港区', Chiyoda: '千代田区',
  Setagaya: '世田谷区', Yokohama: '横浜市', Kawasaki: '川崎市', Saitama: 'さいたま市', Osaka: '大阪市',
  Nagoya: '名古屋市', Sapporo: '札幌市', Fukuoka: '福岡市', Sendai: '仙台市', Takasaki: '高崎市',
  Maebashi: '前橋市', Kyoto: '京都市', Kobe: '神戸市', Chiba: '千葉市',
};
const PREF_JA = {
  Niigata: '新潟', Tokyo: '東京', Nagano: '長野', Kanagawa: '神奈川', Saitama: '埼玉', Chiba: '千葉',
  Osaka: '大阪', Aichi: '愛知', Gunma: '群馬', Hokkaido: '北海道', Fukuoka: '福岡', Miyagi: '宮城',
  Kyoto: '京都', Hyogo: '兵庫', Toyama: '富山', Ishikawa: '石川', Fukushima: '福島', Yamagata: '山形',
};
function cityLabel(city, region) {
  const base = city.replace(/ (City|Ward|Town|Village)$/, '');
  const ja = CITY_JA[base] || city;
  const pref = region.replace(/ Prefecture$/, '');
  if (pref === 'Niigata') return ja;
  return `${ja}（${PREF_JA[pref] || pref}）`;
}

// ---------- HTML 部品 ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('ja-JP');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const width = (v, max) => (max ? Math.max(1, Math.round((v / max) * 100)) : 0);

function diffText(cur, prev) {
  if (prev == null) return '';
  if (!prev) return `<br>前月 0`;
  const d = Math.round(((cur - prev) / prev) * 100);
  const mark = d > 0 ? '▲' : d < 0 ? '▼' : '±';
  const color = d > 0 ? '#047857' : d < 0 ? '#B45309' : '#6B7280';
  return `<br>前月 ${fmt(prev)} → <span style="color:${color};font-weight:700;">${mark} ${d > 0 ? '+' : ''}${d}%</span>`;
}

function kpi(label, value, unit, desc, prev) {
  return `<div class="kpi">
<div class="k-label">${label}</div>
<div class="k-value">${fmt(value)}${unit ? `<small>${unit}</small>` : ''}</div>
<div class="k-desc">${desc}${diffText(value, prev)}</div>
</div>`;
}

function buildHtml(mi, cur, prev, profile, styles) {
  const t = cur.totals;
  const p = prev ? prev.totals : null;
  const isBaseline = mi.ym === BASELINE;
  const issued = jstNow();
  const issuedText = `${issued.getUTCFullYear()}年${issued.getUTCMonth() + 1}月${issued.getUTCDate()}日`;

  // ② チャネル
  const chTotal = cur.channels.reduce((s, c) => s + c.value, 0);
  const chMax = cur.channels.length ? cur.channels[0].value : 0;
  const channelRows = cur.channels.filter((c) => c.value > 0).map((c) => {
    const [name, sub] = channelLabel(c.name);
    const green = /^ai/i.test(c.name) ? ' green' : '';
    return `<div class="bar-row">
<span class="b-name">${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>
<span class="bar-track"><span class="bar-fill${green}" style="width:${width(c.value, chMax)}%"></span></span>
<span class="b-val">${fmt(c.value)}<small> 回 / ${pct(c.value, chTotal)}%</small></span>
</div>`;
  }).join('\n');
  const share = (n) => pct((cur.channels.find((c) => c.name === n) || { value: 0 }).value, chTotal);
  const snsShare = share('Organic Social');
  const directShare = share('Direct');
  const topCh = cur.channels[0];
  const topChName = topCh ? channelLabel(topCh.name)[0] : '';

  // ③ 参照元
  const srcTotal = cur.sources.reduce((s, r) => s + r.value, 0);
  const sourceRows = cur.sources.map((r, i) => {
    const { label, desc } = sourceInfo(r.source, r.medium);
    return `<tr${i === 0 ? ' class="hi"' : ''}><td>${esc(label)}</td><td class="num">${fmt(r.value)}</td><td class="sub">${esc(desc)}${i === 0 ? ' ― <b>最大の入口</b>' : ''}</td></tr>`;
  }).join('\n');
  const igUsers = cur.sources.filter((r) => /^ig$|instagram|threads/i.test(r.source)).reduce((s, r) => s + r.value, 0);
  const aiUsers = cur.sources.filter((r) => isAiSource(r.source)).reduce((s, r) => s + r.value, 0);

  // ④ ページ
  const pageList = Object.entries(cur.pages).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const pgMax = pageList.length ? pageList[0][1] : 0;
  const pageRows = pageList.map(([k, v]) =>
    `<div class="bar-row"><span class="b-name">${esc(PAGE_LABELS[k] || k)}</span><span class="bar-track"><span class="bar-fill" style="width:${width(v, pgMax)}%"></span></span><span class="b-val">${fmt(v)}<small> 回</small></span></div>`
  ).join('\n');
  const pv = (k) => cur.pages[k] || 0;
  const f = {
    top: pv('/'),
    prod: PRODUCT_PAGES.reduce((s, k) => s + pv(k), 0),
    cart: pv('/cart'),
    checkout: pv('/checkout'),
  };
  const stages = [
    { name: '「トップ → 商品を見る」', rate: pct(f.prod, f.top) },
    { name: '「商品を見る → カートに入れる」', rate: pct(f.cart, f.prod) },
    { name: '「カート → ご注文手続き」', rate: pct(f.checkout, f.cart) },
  ];
  const worst = stages.reduce((a, b) => (b.rate < a.rate ? b : a));
  const fw = (v) => Math.max(12, width(v, f.top));

  // ⑤ 地域
  const countryRows = cur.countries.map((c) =>
    `<div class="geo-row"><span class="g-name">${flag(c.id)} ${esc(COUNTRY_JA[c.id] || c.name)}</span><span class="g-val">${fmt(c.value)}<small> 人</small></span></div>`
  ).join('\n');
  const cityRows = cur.cities.map((c) =>
    `<div class="geo-row"><span class="g-name">${esc(cityLabel(c.city, c.region))}</span><span class="g-val">${fmt(c.value)}<small> 人</small></span></div>`
  ).join('\n');
  const outsideNiigata = cur.cities.filter((c) => c.region && !/Niigata/.test(c.region)).map((c) => cityLabel(c.city, c.region));
  const overseas = cur.countries.filter((c) => c.id !== 'JP').reduce((s, c) => s + c.value, 0);

  // 所見（数字に応じた定型文）
  const insights = [];
  if (p) {
    const d = p.users ? Math.round(((t.users - p.users) / p.users) * 100) : 0;
    insights.push(d >= 0
      ? { h: `訪問者数は前月より ${d}% ${d > 0 ? '増加' : '横ばい'}`, tag: d > 0 ? '成長' : '安定', cls: '', b: `今月は <strong>${fmt(t.users)}人</strong>（前月 ${fmt(p.users)}人）がサイトを訪れました。${d > 0 ? '集客が着実に伸びています。' : '前月と同じ水準を維持しています。'}` }
      : { h: `訪問者数は前月より ${Math.abs(d)}% 減少`, tag: '注目', cls: 'watch', b: `今月は <strong>${fmt(t.users)}人</strong>（前月 ${fmt(p.users)}人）でした。月ごとの波はよくあることですが、<strong>SNS の投稿頻度や新商品の告知タイミング</strong>と合わせて見ていくと、原因がつかみやすくなります。` });
  }
  if (igUsers && srcTotal) {
    insights.push({ h: 'Instagram が集客の中心です', tag: '強み', cls: '', b: `初めてサイトに来た方のうち <strong>約${pct(igUsers, srcTotal)}%（${fmt(igUsers)}人）が Instagram 系</strong>からでした。投稿を続けること・商品写真や使用シーンを定期的に発信することが、引き続き集客の鍵になります。` });
  }
  if (f.top && f.prod) {
    insights.push({ h: `${worst.name}の後押し`, tag: '改善余地', cls: 'watch', b: `ご購入の流れのうち、次の段階へ進む割合が一番低いのは${worst.name}（${worst.rate}%）でした。<strong>送料無料の条件を分かりやすく表示する・お客様の声や使用例を載せる・ボタンを目立たせる</strong>といった工夫が効果的です。` });
  }
  if (aiUsers) {
    insights.push({ h: 'AI 経由の流入', tag: '新トレンド', cls: '', b: `ChatGPT などの AI 経由で <strong>${fmt(aiUsers)}人</strong>が来訪しました。<strong>商品情報を分かりやすい文章で整えておく</strong>ことが、これからの集客につながります。` });
  }
  if (!t.keyEvents) {
    insights.push({ h: '購入（売上）まで計測できるようにする', tag: 'ご要望に応じて', cls: 'todo', b: `現在の計測ツール（GA4）は購入を数える設定が入っていないため、購入数は「0」と表示されます（売上がゼロという意味ではありません）。設定を加えると、<strong>どの入口が売上につながったか</strong>まで見えるようになります。<strong>ご要望をいただければ弊社（ONTECH）にて対応いたします</strong>。` });
  }
  const insightHtml = insights.map((x, i) =>
    `<div class="insight">
<h4>${i + 1}. ${x.h} <span class="tag${x.cls ? ' ' + x.cls : ''}">${x.tag}</span></h4>
<p>${x.b}</p>
</div>`).join('\n\n');

  const intro = isBaseline
    ? `本レポートでは<strong>2026年7月</strong>を今後の「基準（ベースライン）」とし、アクセスの状況を整理してご報告いたします。`
    : `<strong>${mi.y}年${mi.m}月</strong>のアクセス状況をご報告いたします。${p ? '前月の数字と並べて、変化が分かるようにしています。' : ''}`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>アクセス解析レポート ${mi.y}年${mi.m}月 - ${esc(profile.client)}様 - ONTECH</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&family=Noto+Serif+JP:wght@400;700&display=swap" rel="stylesheet">
<style>${styles}</style>
</head>
<body>

<button class="print-btn no-print" onclick="window.print()">PDFとして保存 / 印刷</button>

<div class="report">

<header class="report-header">
<h1 class="report-title">アクセス解析レポート
<small>White Snow Paws ／ ${mi.y}年${mi.m}月</small>
</h1>
<div class="report-meta">
<div>対象サイト：<strong>whitesnowpaws.jp</strong></div>
<div>対象期間：<strong>${mi.y}年${mi.m}月1日〜${mi.last}日</strong></div>
<div>発行日：<strong>${issuedText}</strong></div>
</div>
</header>

<div class="report-parties">
<div class="report-to">
<span class="client">${esc(profile.client)}</span><span class="honor">様</span>
<p class="intro">
いつもお世話になっております。<br>
${intro}
</p>
</div>
<div class="report-from">
${profile.logo ? `<img src="${profile.logo}" alt="ONTECH" class="report-from-logo">` : ''}
<div class="name">${esc(profile.name)}</div>
<div>${esc(profile.address)}</div>
<div>TEL: ${esc(profile.tel)}</div>
</div>
</div>

<div class="howto">
<h3>📘 このレポートに出てくる言葉</h3>
<dl>
<dt>ユーザー</dt><dd>サイトを見に来た「人数」（同じ人が何回来ても1人と数えます）</dd>
<dt>セッション</dt><dd>サイトへの「訪問回数」（1人が朝と夜に来れば2回と数えます）</dd>
<dt>表示回数（PV）</dt><dd>ページが「見られた回数」</dd>
<dt>流入チャネル</dt><dd>お客様が「どこから来たか」の分類（SNS・検索・直接など）</dd>
</dl>
</div>

<div class="section">
<div class="section-title">① 今月の全体像<span class="en">Overview</span></div>
<div class="kpi-grid">
${kpi('ユーザー（人数）', t.users, '人', 'サイトを見に来た人数', p && p.users)}
${kpi('セッション（訪問）', t.sessions, '', 'サイトへ訪問された回数', p && p.sessions)}
${kpi('表示回数（PV）', t.views, '', 'ページが見られた回数', p && p.views)}
${kpi('イベント（操作）', t.events, '', 'クリックなどの操作回数', p && p.events)}
</div>
<p class="lead" style="margin-top:14px;">
${mi.m}月は <strong>${fmt(t.users)}人のお客様</strong>がサイトを訪れ、<strong>${fmt(t.sessions)}回の訪問</strong>で <strong>${fmt(t.views)}ページ</strong>がご覧いただかれました。
</p>
</div>

<div class="section">
<div class="section-title">② どこから来ているか（流入チャネル）<span class="en">Channels</span></div>
<p class="lead">お客様がサイトにたどり着いた「入口」の内訳です（訪問${fmt(chTotal)}回の中身）。バーが長いほど、その入口から多く来ています。</p>
<div class="bars">
${channelRows}
</div>
<div class="takeaway">
▶ 一番多い入口は <b>${esc(topChName)}（${topCh ? pct(topCh.value, chTotal) : 0}%）</b>。
SNS（${snsShare}%）と直接アクセス（${directShare}%）を合わせると <b>全体の約${snsShare + directShare}%</b> です。
</div>
</div>

<div class="section">
<div class="section-title">③ もっと詳しい入口（参照元）<span class="en">Source</span></div>
<p class="lead">お客様が<strong>初めてサイトを見つけた場所</strong>の内訳（人数）です。</p>
<table class="tbl">
<thead>
<tr><th>入口（参照元）</th><th class="num">人数</th><th>これは何？</th></tr>
</thead>
<tbody>
${sourceRows}
</tbody>
</table>
${igUsers ? `<div class="takeaway">▶ Instagram 系（ig・Instagram リンク・Threads）を合わせると <b>約${fmt(igUsers)}人 ― 上位の入口全体のおよそ${pct(igUsers, srcTotal)}%</b> です。</div>` : ''}
</div>

<div class="section">
<div class="section-title">④ よく見られたページと購入の流れ<span class="en">Pages &amp; Funnel</span></div>
<p class="lead">どのページがよく見られたか（表示回数）です。</p>
<div class="bars">
${pageRows}
</div>

<p class="lead" style="margin:16px 0 8px;"><strong>▼ ご購入までの流れ（どこで離れてしまうか）</strong></p>
<div class="funnel">
<div class="funnel-step">
<div class="funnel-bar" style="width:100%"><span>① トップページを見る</span><span class="fb-num">${fmt(f.top)}</span></div>
<span class="funnel-drop">スタート地点</span>
</div>
<div class="funnel-step">
<div class="funnel-bar" style="min-width:230px;white-space:nowrap;width:${fw(f.prod)}%"><span>② 商品ページを見る</span><span class="fb-num">${fmt(f.prod)}</span></div>
<span class="funnel-drop">トップの ${stages[0].rate}%</span>
</div>
<div class="funnel-step">
<div class="funnel-bar" style="min-width:230px;white-space:nowrap;width:${fw(f.cart)}%"><span>③ カートに入れる</span><span class="fb-num">${fmt(f.cart)}</span></div>
<span class="funnel-drop">商品閲覧の ${stages[1].rate}%</span>
</div>
<div class="funnel-step">
<div class="funnel-bar" style="min-width:230px;white-space:nowrap;width:${fw(f.checkout)}%"><span>④ ご注文手続きへ</span><span class="fb-num">${fmt(f.checkout)}</span></div>
<span class="funnel-drop">カートの ${stages[2].rate}%</span>
</div>
<p class="funnel-note">※ ページの表示回数から流れを表したものです。「商品ページを見る」は BioThane リード・BioThane カラー・商品詳細の3ページの合計です。
次へ進む割合が一番低いのは<strong>${worst.name}</strong>の段階です。</p>
</div>
</div>

<div class="section">
<div class="section-title">⑤ どの地域から見られているか<span class="en">Geography</span></div>
<div class="geo-2col">
<div>
<div class="geo-h">国別（人数）</div>
${countryRows}
</div>
<div>
<div class="geo-h">国内の市区町村別（人数）</div>
${cityRows}
</div>
</div>
<div class="takeaway">
▶ ${outsideNiigata.length ? `新潟県内に加え、<b>${esc(outsideNiigata.slice(0, 3).join('・'))}</b> など県外からのアクセスもありました。` : '中心は<b>新潟県内</b>からのアクセスです。'}${overseas ? `海外からも <b>${fmt(overseas)}人</b>が訪れています。` : ''}
</div>
</div>

<div class="section">
<div class="section-title">⑥ 所見とご提案<span class="en">Next Actions</span></div>

${insightHtml}

<p class="lead" style="margin-top:6px;">
本レポートでご提案した改善は、<strong>${esc(profile.client)}様からご要望・ご依頼をいただいた際に、弊社（ONTECH）にて対応・修正いたします</strong>。お気軽にお申し付けください。
</p>
</div>

<p class="report-notes">
※ 本レポートは Google アナリティクス（GA4）のデータをもとに作成しています。数値は集計方法により実数と若干の差が生じる場合があります。<br>
ご不明な点・ご相談などございましたら、上記連絡先までお気軽にお問い合わせください。今後ともどうぞよろしくお願い申し上げます。
</p>

</div>

</body>
</html>
`;
}

// ---------- メイン ----------
async function main() {
  const ym = targetMonth();
  const key = loadJson('GA4_SA_KEY', 'ga-key.json');
  const profile = loadJson('REPORT_PROFILE', 'profile.json');
  const styles = fs.readFileSync(path.join(__dirname, 'monthly-report.css'), 'utf8');

  const token = await getAccessToken(key);
  const run = makeRunner(token, profile.propertyId);
  const mi = monthInfo(ym);
  const cur = await fetchMonth(run, mi);
  const pym = prevMonth(ym);
  const prev = pym >= BASELINE ? await fetchMonth(run, monthInfo(pym)) : null;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `report-${ym.replace('-', '')}.html`);
  fs.writeFileSync(out, buildHtml(mi, cur, prev, profile, styles));
  console.log(`作成しました: ${out}`);
  console.log(`ユーザー ${cur.totals.users} / セッション ${cur.totals.sessions} / PV ${cur.totals.views}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
