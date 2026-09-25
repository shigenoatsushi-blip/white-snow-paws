/* ===================================================================
   Polyester Webbing（リード／首輪）一般公開スクリプト
   - index.html: 「リード」「カラー(首輪)」カードを COMING SOON 解除しリンク化
   - product-detail.html: 関連商品の「リード」カードもリンク化
   - product-detail.html: id=20〜23専用のパスワードゲートを削除
   何度実行しても安全（適用済みならスキップ）。変更があった時だけ書き込む。
   =================================================================== */
const fs = require('fs');

let changed = false;

/* ---------- index.html ---------- */
let idx = fs.readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
const idxOrig = idx;

// 1) リードカードを COMING SOON → リンク化
const leadFrom = `        <div class="product-card wood-frame fade-up stagger-3" style="cursor:default;">
          <div class="product-card-image">
            <img src="images/polyester-lead/card.jpg" alt="リード" loading="lazy">
            <div class="category-coming-soon"><span>COMING SOON</span></div>
          </div>
          <div class="product-card-info">
            <h4>リード</h4>
            <p class="product-desc">新ラインナップ、準備中</p>
          </div>
        </div>`;
const leadTo = `        <a href="product-detail.html?id=20" class="product-card wood-frame fade-up stagger-3" style="text-decoration:none;color:inherit;">
          <div class="product-card-image">
            <img src="images/polyester-lead/card.jpg" alt="Polyester Webbing リード" loading="lazy">
          </div>
          <div class="product-card-info">
            <h4>Polyester Webbing リード</h4>
            <p class="product-desc">毎日の散歩を彩る、5デザインのポリエステルリード</p>
            <p class="price">¥3,200〜¥3,500 <span class="price-tax">(税込)</span></p>
          </div>
        </a>`;
if (idx.includes(leadFrom)) {
  idx = idx.replace(leadFrom, leadTo);
  console.log('OK: リードカードをリンク化');
} else if (idx.includes('href="product-detail.html?id=20" class="product-card wood-frame fade-up stagger-3"')) {
  console.log('SKIP: リードカードは公開済み');
} else {
  console.error('WARN: リードカードのパターンが見つかりません（要確認）');
}

// 2) 首輪カードを COMING SOON → リンク化
const collarFrom = `        <div class="product-card wood-frame fade-up stagger-4" style="cursor:default;">
          <div class="product-card-image">
            <img src="images/polyester-collar/card.jpg" alt="カラー(首輪)" loading="lazy">
            <div class="category-coming-soon"><span>COMING SOON</span></div>
          </div>
          <div class="product-card-info">
            <h4>カラー(首輪)</h4>
            <p class="product-desc">新ラインナップ、準備中</p>
          </div>
        </div>`;
const collarTo = `        <a href="product-detail.html?id=21" class="product-card wood-frame fade-up stagger-4" style="text-decoration:none;color:inherit;">
          <div class="product-card-image">
            <img src="images/polyester-collar/card.jpg" alt="Polyester Webbing 首輪" loading="lazy">
          </div>
          <div class="product-card-info">
            <h4>Polyester Webbing 首輪</h4>
            <p class="product-desc">S/M/L、5デザインから選べるポリエステル首輪</p>
            <p class="price">¥2,300〜¥2,800 <span class="price-tax">(税込)</span></p>
          </div>
        </a>`;
if (idx.includes(collarFrom)) {
  idx = idx.replace(collarFrom, collarTo);
  console.log('OK: 首輪カードをリンク化');
} else if (idx.includes('href="product-detail.html?id=21" class="product-card wood-frame fade-up stagger-4"')) {
  console.log('SKIP: 首輪カードは公開済み');
} else {
  console.error('WARN: 首輪カードのパターンが見つかりません（要確認）');
}

if (idx !== idxOrig) { fs.writeFileSync('index.html', idx); changed = true; }

/* ---------- product-detail.html ---------- */
let pd = fs.readFileSync('product-detail.html', 'utf8').replace(/\r\n/g, '\n');
const pdOrig = pd;

// 3) 関連商品欄の「リード」カードをリンク化
const relFrom = `        <!-- リード（COMING SOON） -->
        <div class="product-card wood-frame" style="cursor:default;">
          <div class="product-card-image">
            <img src="images/polyester-lead/card.jpg" alt="リード" loading="lazy">
            <div class="category-coming-soon"><span>COMING SOON</span></div>
          </div>
          <div class="product-card-info">
            <h4>リード</h4>
            <p class="price" style="color:#999;">準備中</p>
          </div>
        </div>`;
const relTo = `        <!-- Polyester Webbing リード -->
        <a href="product-detail.html?id=20" class="product-card wood-frame" style="text-decoration:none;color:inherit;">
          <div class="product-card-image">
            <img src="images/polyester-lead/card.jpg" alt="Polyester Webbing リード" loading="lazy">
          </div>
          <div class="product-card-info">
            <h4>Polyester Webbing リード</h4>
            <p class="price">¥3,200〜¥3,500 <span class="price-tax">(税込)</span></p>
          </div>
        </a>`;
if (pd.includes(relFrom)) {
  pd = pd.replace(relFrom, relTo);
  console.log('OK: 関連商品のリードカードをリンク化');
} else if (pd.includes('href="product-detail.html?id=20" class="product-card wood-frame" style="text-decoration:none;color:inherit;"')) {
  console.log('SKIP: 関連商品のリードカードは公開済み');
} else {
  console.error('WARN: 関連商品のリードカードのパターンが見つかりません（要確認）');
}

// 4) パスワードゲート（id=20〜23専用）を削除
const gateRe = /[ \t]*<!-- ===================================\r?\n[ \t]*準備中パスワードゲート（Polyester Webbing 商品 id=20〜23 のみ）[\s\S]*?\n[ \t]*<\/script>\r?\n\r?\n/;
if (gateRe.test(pd)) {
  pd = pd.replace(gateRe, '');
  console.log('OK: パスワードゲートを削除');
} else if (!pd.includes('準備中パスワードゲート（Polyester Webbing')) {
  console.log('SKIP: パスワードゲートは既に削除済み');
} else {
  console.error('WARN: パスワードゲートのパターンが見つかりません（要確認）');
}

if (pd !== pdOrig) { fs.writeFileSync('product-detail.html', pd); changed = true; }

console.log(changed ? '=== 変更を適用しました ===' : '=== 変更なし（既に公開済み） ===');
process.exit(0);
