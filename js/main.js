/* ===================================
   White Snow Paws - メインロジック
   =================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --- ヘッダースクロール制御 ---
  const header = document.getElementById('header');
  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const currentScroll = window.scrollY;

    // 100px以降でスクロール済みスタイル適用
    if (currentScroll > 100) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }

    lastScroll = currentScroll;
  });

  // --- ハンバーガーメニュー ---
  const hamburger = document.getElementById('hamburgerMobileBottom');
  const mobileMenu = document.getElementById('mobileMenu');
  const menuOverlay = document.getElementById('menuOverlay');

  function toggleMenu() {
    if (hamburger) hamburger.classList.toggle('active');
    if (mobileMenu) mobileMenu.classList.toggle('active');
    if (menuOverlay) menuOverlay.classList.toggle('active');
    if (mobileMenu) {
      document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
    }
  }

  if (hamburger) {
    hamburger.addEventListener('click', toggleMenu);
  }
  if (menuOverlay) {
    menuOverlay.addEventListener('click', toggleMenu);
  }

  // メニュー内リンクをクリックした時に閉じる
  if (mobileMenu) {
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        if (mobileMenu.classList.contains('active')) {
          toggleMenu();
        }
      });
    });
  }

  // --- モバイルボトムメニュー（スマホのみ表示） ---
  // CSSの position: fixed で常に下に表示されるため、特別なJSによる表示制御は不要です。

  // --- パララックス効果（ストーリーセクション） ---
  const storyBg = document.querySelector('.story-bg');

  if (storyBg) {
    window.addEventListener('scroll', () => {
      const section = storyBg.closest('.story-section');
      const rect = section.getBoundingClientRect();
      const speed = 0.3;

      if (rect.top < window.innerHeight && rect.bottom > 0) {
        const yPos = (rect.top * speed);
        storyBg.style.transform = `translateY(${yPos}px)`;
      }
    });
  }

  // --- フローティングCTA制御 ---
  const floatingCta = document.getElementById('floatingCta');
  const heroSection = document.getElementById('hero');

  if (floatingCta && heroSection) {
    window.addEventListener('scroll', () => {
      const heroBottom = heroSection.offsetTop + heroSection.offsetHeight;
      if (window.scrollY > heroBottom - 100) {
        floatingCta.classList.add('visible');
      } else {
        floatingCta.classList.remove('visible');
      }
    });
  }

  // --- Page Up / Page Down キーボード操作 ---
  document.addEventListener('keydown', (e) => {
    // 入力欄・テキストエリア・セレクトにフォーカス中は無効
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const scrollAmount = Math.round(window.innerHeight * 0.85);
    // 長押し（キーリピート）中はアニメーションなしで即時スクロール
    const scrollBehavior = e.repeat ? 'instant' : 'smooth';

    if (e.key === 'PageDown') {
      e.preventDefault();
      window.scrollBy({ top: scrollAmount, behavior: scrollBehavior });
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      window.scrollBy({ top: -scrollAmount, behavior: scrollBehavior });
    }
  });

  // ページ読み込み時にbodyにフォーカスを当てて、キーボード操作を有効化
  document.body.setAttribute('tabindex', '-1');
  document.body.focus();
  document.body.removeAttribute('tabindex');

});
