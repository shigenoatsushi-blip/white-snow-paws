/* ===================================================================
   BioThane カラー（首輪）一般公開スクリプト
   - index.html: 「BioThane カラー（首輪）」カードを COMING SOON 解除しリンク化
   - index.html: フッターの「BioThane カラー（準備中）」をリンク有効化
   - biothane-collar.html: パスワードゲート と noindex を削除
   何度実行しても安全（適用済みならスキップ）。変更があった時だけ書き込む。
   =================================================================== */
const fs = require('fs');

let changed = false;

/* ---------- index.html ---------- */
// 改行コードは LF に正規化して処理（CRLF/LF どちらの環境でも一致させる）
let idx = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const idxOrig = idx;

// 1) 首輪カードを <div>(COMING SOON) → <a>(リンク) に
const cardFrom = `        <div class="product-card wood-frame fade-up stagger-2" style="cursor:default;">
          <div class="product-card-image">
            <img src="images/biothane/collar-8375.jpg" alt="BioThane カラー（首輪）" loading="lazy">
            <div class="category-coming-soon"><span>COMING SOON</span></div>
          </div>
          <div class="product-card-info">
            <h4>BioThane カラー（首輪）</h4>
            <p class="product-desc">サイズ豊富なBioThane首輪</p>
          </div>
        </div>`;
const cardTo = `        <a href="biothane-collar.html" class="product-card wood-frame fade-up stagger-2" style="text-decoration:none;color:inherit;">
          <div class="product-card-image">
            <img src="images/biothane/collar-8375.jpg" alt="BioThane カラー（首輪）" loading="lazy">
          </div>
          <div class="product-card-info">
            <h4>BioThane カラー（首輪）</h4>
            <p class="product-desc">サイズ豊富なBioThane首輪</p>
          </div>
        </a>`;
if (idx.includes(cardFrom)) {
  idx = idx.replace(cardFrom, cardTo);
  console.log('OK: 首輪カードをリンク化');
} else if (idx.includes('href="biothane-collar.html" class="product-card wood-frame fade-up stagger-2"')) {
  console.log('SKIP: 首輪カードは公開済み');
} else {
  console.error('WARN: 首輪カードのパターンが見つかりません（要確認）');
}

// 2) フッターリンク有効化
const footFrom = `<li><span style="color:#999;">BioThane カラー（準備中）</span></li>`;
const footTo = `<li><a href="biothane-collar.html">BioThane カラー</a></li>`;
if (idx.includes(footFrom)) {
  idx = idx.replace(footFrom, footTo);
  console.log('OK: フッターリンク有効化');
} else {
  console.log('SKIP: フッターは公開済みまたは対象なし');
}

if (idx !== idxOrig) { fs.writeFileSync('index.html', idx); changed = true; }

/* ---------- biothane-collar.html ---------- */
let col = fs.readFileSync('biothane-collar.html', 'utf8').replace(/\r\n/g, '\n');
const colOrig = col;

// noindex（コメント＋metaタグ）を削除
col = col.replace(/[ \t]*<!-- 準備中ページのため検索エンジンに載せない -->\r?\n/, '');
col = col.replace(/[ \t]*<meta name="robots" content="noindex,nofollow">\r?\n/, '');

// パスワードゲート（マーカーコメント〜直後の </script> まで）を削除
col = col.replace(/[ \t]*<!-- 準備中ページ用パスワードゲート[\s\S]*?<\/script>\r?\n/, '');

if (col !== colOrig) {
  fs.writeFileSync('biothane-collar.html', col);
  changed = true;
  console.log('OK: 首輪ページのパスワードゲート/noindex を削除');
} else {
  console.log('SKIP: 首輪ページは公開済み');
}

console.log(changed ? '=== 変更を適用しました ===' : '=== 変更なし（既に公開済み） ===');
process.exit(0);
