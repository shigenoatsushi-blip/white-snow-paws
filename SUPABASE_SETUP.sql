-- ============================================================
-- White Snow Paws EC - Supabase テーブルセットアップ
-- Supabase ダッシュボード → SQL Editor で実行してください
-- ============================================================

-- 顧客プロフィール（Supabase Authと連動）
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_name TEXT,
  first_name TEXT,
  last_kana TEXT,
  first_kana TEXT,
  phone TEXT,
  points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 注文ヘッダー
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE,
  user_id UUID REFERENCES auth.users(id),
  stripe_session_id TEXT UNIQUE,
  status TEXT DEFAULT 'paid',
  customer_email TEXT NOT NULL,
  shipping_last_name TEXT,
  shipping_first_name TEXT,
  shipping_postal TEXT,
  shipping_prefecture TEXT,
  shipping_city TEXT,
  shipping_address TEXT,
  shipping_phone TEXT,
  remarks TEXT,
  subtotal INTEGER,
  shipping_fee INTEGER,
  total INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 注文明細
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT,
  color TEXT,
  price INTEGER,
  quantity INTEGER
);

-- 保存済み住所（会員のみ）
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT DEFAULT 'デフォルト',
  last_name TEXT,
  first_name TEXT,
  postal_code TEXT,
  prefecture TEXT,
  city TEXT,
  address1 TEXT,
  phone TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (RLS) 設定
-- ============================================================

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles: 本人のみ読み取り" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles: 本人のみ書き込み" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles: 本人のみ更新" ON profiles FOR UPDATE USING (auth.uid() = id);

-- orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders: 本人のみ読み取り" ON orders FOR SELECT USING (auth.uid() = user_id);
-- INSERT/UPDATE はservice_role（Netlify Function）のみ

-- order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items: 本人のみ読み取り" ON order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));

-- addresses
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addresses: 本人のみ読み取り" ON addresses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "addresses: 本人のみ書き込み" ON addresses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "addresses: 本人のみ更新" ON addresses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "addresses: 本人のみ削除" ON addresses FOR DELETE USING (auth.uid() = user_id);
