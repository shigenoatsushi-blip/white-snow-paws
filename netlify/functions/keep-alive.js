/* ===================================
   Netlify Scheduled Function: keep-alive
   Supabase 無料プランの自動ポーズを防ぐため、毎日1回 DB に軽量クエリを投げる。
   7日間アクセスなしでポーズされる仕様 → 1日1回で確実に維持。
   =================================== */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async () => {
  const startedAt = new Date().toISOString();
  try {
    const { error, count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true });

    if (error) throw error;

    console.log(`keep-alive ok: ts=${startedAt} order_count=${count}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ts: startedAt, order_count: count }),
    };
  } catch (err) {
    console.error('keep-alive error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message, ts: startedAt }),
    };
  }
};
