/* ===================================
   White Snow Paws - Supabase クライアント初期化
   =================================== */

// Supabase JS SDK (CDN から読み込む場合は index.html に追加)
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

const _supabase = window.supabase.createClient(
  WSP_CONFIG.SUPABASE_URL,
  WSP_CONFIG.SUPABASE_ANON_KEY
);
