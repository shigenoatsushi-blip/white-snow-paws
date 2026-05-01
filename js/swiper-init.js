/* ===================================
   White Snow Paws - Swiper 初期化
   =================================== */

document.addEventListener('DOMContentLoaded', () => {

    // --- ヒーロースライダー ---
    const heroSwiper = new Swiper('.hero-swiper', {
        loop: true,
        effect: 'fade',
        fadeEffect: {
            crossFade: true
        },
        autoplay: {
            delay: 5000,
            disableOnInteraction: false,
        },
        speed: 1200,
        pagination: {
            el: '.swiper-pagination',
            clickable: true,
        },
    });

    // --- BioThaneメイン画像スライダー（矢印ナビ付き・手動切替） ---
    new Swiper('.biothane-main-swiper', {
        loop: true,
        speed: 600,
        pagination: {
            el: '.biothane-main-pagination',
            clickable: true,
        },
        navigation: {
            nextEl: '.biothane-main-swiper .swiper-button-next',
            prevEl: '.biothane-main-swiper .swiper-button-prev',
        },
    });

    // --- BioThane商品ギャラリー（自動スクロール） ---
    const biothaneGallery = new Swiper('.biothane-gallery', {
        slidesPerView: 'auto',
        spaceBetween: 12,
        loop: true,
        grabCursor: true,
        autoplay: {
            delay: 2500,
            disableOnInteraction: false,
        },
        speed: 800,
        breakpoints: {
            768: { spaceBetween: 16 },
            1024: { spaceBetween: 20 }
        }
    });

});
