/* ===================================
   White Snow Paws - スクロールアニメーション
   Intersection Observer API
   =================================== */

document.addEventListener('DOMContentLoaded', () => {

    // setTimeoutを使って少し遅らせることでDOMのレンダリング完了を待つ
    setTimeout(() => {
        // フェードアップ対象要素を取得
        const fadeElements = document.querySelectorAll('.fade-up');

        // Intersection Observer設定
        const observerOptions = {
            root: null,         // ビューポートを基準
            rootMargin: '0px 0px -50px 0px', // 下から50px手前まで来たら発火
            threshold: 0.1      // 10%見えた時点で発火
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                    observer.unobserve(entry.target); // 一度だけ実行
                }
            });
        }, observerOptions);

        // 各要素を監視開始
        fadeElements.forEach(el => {
            observer.observe(el);
        });

        // --- 画面内に入っているものは最初から表示（ヒーローセクション付近など） ---
        fadeElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight) {
                el.classList.add('active');
                observer.unobserve(el);
            }
        });
    }, 100);

});
