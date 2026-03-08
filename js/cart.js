/* ===================================
   White Snow Paws - カート管理
   localStorage を使ったカート状態管理
   =================================== */

const Cart = (() => {
  const STORAGE_KEY = 'wsp_cart';

  /* カートデータ取得 */
  function getItems() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  /* カートデータ保存 */
  function save(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    updateBadges();
  }

  /* 商品をカートに追加 */
  function addItem(product) {
    const items = getItems();
    // id + color で同一商品チェック
    const key = product.id + '_' + (product.color || '');
    const existing = items.find(i => (i.id + '_' + (i.color || '')) === key);
    if (existing) {
      existing.quantity += product.quantity || 1;
    } else {
      items.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image || '',
        color: product.color || '',
        quantity: product.quantity || 1,
      });
    }
    save(items);
    return true;
  }

  /* 数量変更 */
  function updateQuantity(id, color, quantity) {
    const items = getItems();
    const key = id + '_' + (color || '');
    const item = items.find(i => (i.id + '_' + (i.color || '')) === key);
    if (item) {
      item.quantity = Math.max(1, quantity);
      save(items);
    }
  }

  /* 商品削除 */
  function removeItem(id, color) {
    const items = getItems().filter(
      i => !((i.id + '_' + (i.color || '')) === (id + '_' + (color || '')))
    );
    save(items);
  }

  /* カート合計件数 */
  function count() {
    return getItems().reduce((sum, i) => sum + i.quantity, 0);
  }

  /* カート合計金額 */
  function total() {
    return getItems().reduce((sum, i) => sum + i.price * i.quantity, 0);
  }

  /* カートバッジを全ページで更新 */
  function updateBadges() {
    const n = count();
    document.querySelectorAll('.cart-badge, .cart-badge-bottom').forEach(el => {
      el.textContent = n;
      el.style.display = n > 0 ? 'flex' : 'none';
    });
  }

  /* 初期化：ページ読み込み時にバッジ更新 */
  function init() {
    updateBadges();

    /* 商品カードの「カートに入れる」ボタン */
    document.addEventListener('click', e => {
      const btn = e.target.closest('.btn-add-cart');
      if (!btn) return;
      e.preventDefault();

      const product = {
        id: btn.dataset.id,
        name: btn.dataset.name,
        price: parseInt(btn.dataset.price, 10),
        image: btn.dataset.image || '',
        color: btn.dataset.color || '',
        quantity: 1,
      };

      addItem(product);

      /* ボタンを一時的に「追加しました」表示 */
      const original = btn.textContent;
      btn.textContent = '✓ カートに追加しました';
      btn.disabled = true;
      btn.style.background = '#4A7C59';
      btn.style.color = '#FAF8F5';
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
        btn.style.background = '';
        btn.style.color = '';
      }, 1500);
    });
  }

  return { init, addItem, removeItem, updateQuantity, getItems, count, total, updateBadges };
})();

document.addEventListener('DOMContentLoaded', () => Cart.init());
