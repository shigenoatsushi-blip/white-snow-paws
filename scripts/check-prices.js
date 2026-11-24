/* ===================================
   価格表の一致チェック（サイトには載らない・手元で実行）
   使い方: node scripts/check-prices.js
   商品ページに書いてある価格（全商品・全長さ・カラビナ有無）と
   netlify/functions/_shared/price-check.js の価格表が一致するかを確かめる
   =================================== */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const { PRICE_TABLE, KARABINA_PRICE, expectedPrice, findMismatches } =
  require(path.join(root, 'netlify/functions/_shared/price-check.js'));

let ng = 0;
const ok = (cond, msg) => { if (!cond) { ng++; console.log('NG ' + msg); } };

// 1) product-detail.html の PRODUCTS を読み取る
const pd = fs.readFileSync(path.join(root, 'product-detail.html'), 'utf8');
const start = pd.indexOf('const PRODUCTS = {');
const end = pd.indexOf('\n    };', start);
const PRODUCTS = new Function('return ' + pd.slice(start + 'const PRODUCTS = '.length, end + 6))();
const karabinaInPage = /karabinaPrice:\s*(\d+)/.exec(pd);
ok(karabinaInPage && Number(karabinaInPage[1]) === KARABINA_PRICE, `カラビナ料金 ページ=${karabinaInPage && karabinaInPage[1]} 表=${KARABINA_PRICE}`);

const seen = new Set();
Object.values(PRODUCTS).forEach((p) => {
  seen.add(p.id);
  if (p.lengths) {
    Object.entries(p.lengths).forEach(([len, price]) => {
      [false, true].forEach((k) => {
        const page = price + (k ? KARABINA_PRICE : 0);
        const exp = expectedPrice({ id: p.id, length: len, options: { karabina: k } });
        ok(exp === page, `id=${p.id} ${p.name} ${len}${k ? '+カラビナ' : ''} ページ=${page} 表=${exp}`);
      });
    });
  } else {
    const page = p.price || p.basePrice;
    ok(expectedPrice({ id: p.id }) === page, `id=${p.id} ${p.name} ページ=${page} 表=${expectedPrice({ id: p.id })}`);
  }
});

// 2) Polyester 首輪のサイズボタン価格
const sizeRe = /\{ size:'(\w)', id:'(\d+)', price:(\d+)/g;
let m;
while ((m = sizeRe.exec(pd))) ok(expectedPrice({ id: m[2] }) === Number(m[3]), `首輪サイズ${m[1]} id=${m[2]} ページ=${m[3]}`);

// 3) woodburning.html
const wb = fs.readFileSync(path.join(root, 'woodburning.html'), 'utf8');
const wbm = /id: '(\d+)',\s*name: 'ウッドバーニング',\s*price: (\d+)/.exec(wb);
ok(wbm && expectedPrice({ id: wbm[1] }) === Number(wbm[2]), `ウッドバーニング ページ=${wbm && wbm[2]}`);
if (wbm) seen.add(wbm[1]);

// 4) フード（js/food-data.js）
const FOOD_ITEMS = new Function(fs.readFileSync(path.join(root, 'js/food-data.js'), 'utf8') + '\nreturn FOOD_ITEMS;')();
FOOD_ITEMS.forEach((f) => { seen.add(f.id); ok(expectedPrice({ id: f.id }) === f.price, `フード id=${f.id} ${f.name} ページ=${f.price}`); });

// 5) 価格表にだけあってページに無いID
Object.keys(PRICE_TABLE).forEach((id) => ok(seen.has(id), `価格表のid=${id} がページに見当たらない`));

// 6) 照合ロジックの動作確認
ok(findMismatches([{ id: '30', price: 700, quantity: 1 }]).length === 0, '正しいフードが通らない');
ok(findMismatches([{ id: '30', price: 1, quantity: 1 }]).length === 1, '1円が検出されない');
ok(findMismatches([{ id: '1', price: 3800, length: '1200mm', quantity: 2 }]).length === 0, '正しいリードが通らない');
ok(findMismatches([{ id: '1', price: 5100, length: '1200mm', options: { karabina: true }, quantity: 1 }]).length === 0, 'カラビナ付きが通らない');
ok(findMismatches([{ id: '1', price: 3800, length: '1200mm', options: { karabina: true }, quantity: 1 }]).length === 1, 'カラビナ料金抜きが検出されない');
ok(findMismatches([{ id: '99', price: 100, quantity: 1 }]).length === 1, '存在しない商品が検出されない');
ok(findMismatches([{ id: '30', price: 700, quantity: -3 }]).length === 1, 'マイナス数量が検出されない');

console.log(ng === 0 ? `OK: 全商品の価格が一致しました（ページ上の商品 ${seen.size} 件）` : `NG: ${ng} 件の不一致があります`);
process.exit(ng === 0 ? 0 : 1);
