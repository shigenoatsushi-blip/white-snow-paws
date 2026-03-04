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

  // --- パスワード認証（限定公開） ---
  const lockOverlay = document.getElementById('lockOverlay');
  const lockForm = document.getElementById('lockForm');
  const passInput = document.getElementById('passInput');
  const lockError = document.getElementById('lockError');
  const CORRECT_PASS = 'snowpaws'; // 簡易的なパスワード

  // すでに認証済みかチェック
  if (sessionStorage.getItem('site_auth') === 'true') {
    if (lockOverlay) {
      lockOverlay.classList.add('hidden');
      document.body.classList.remove('is-locked');
    }
  }

  if (lockForm) {
    lockForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (passInput.value === CORRECT_PASS) {
        sessionStorage.setItem('site_auth', 'true');
        lockOverlay.classList.add('hidden');
        document.body.classList.remove('is-locked');
      } else {
        lockError.classList.add('visible');
        passInput.value = '';
        setTimeout(() => lockError.classList.remove('visible'), 3000);
      }
    });
  }

});
