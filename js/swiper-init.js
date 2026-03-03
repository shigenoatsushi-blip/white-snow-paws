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

    // --- BioThane商品ギャラリー ---
    const biothaneGallery = new Swiper('.biothane-gallery', {
        slidesPerView: 'auto',
        spaceBetween: 12,
        freeMode: true,
        grabCursor: true,
        breakpoints: {
            768: {
                spaceBetween: 16,
            },
            1024: {
                spaceBetween: 20,
            }
        }
    });

});
