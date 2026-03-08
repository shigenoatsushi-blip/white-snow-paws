/* ===================================
   White Snow Paws - 認証ユーティリティ
   =================================== */

const WSP_Auth = {

  // 現在のセッション取得
  async getSession() {
    const { data, error } = await _supabase.auth.getSession();
    if (error) return null;
    return data.session;
  },

  // 現在のユーザー取得
  async getUser() {
    const session = await this.getSession();
    return session ? session.user : null;
  },

  // プロフィール取得
  async getProfile(userId) {
    const { data, error } = await _supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) return null;
    return data;
  },

  // ログイン
  async login(email, password) {
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  // 新規登録
  async register(email, password, profileData) {
    const { data, error } = await _supabase.auth.signUp({ email, password });
    if (error) throw error;

    // プロフィール作成
    if (data.user) {
      await _supabase.from('profiles').upsert({
        id: data.user.id,
        ...profileData,
      });
    }
    return data;
  },

  // ログアウト
  async logout() {
    const { error } = await _supabase.auth.signOut();
    if (error) throw error;
    window.location.href = 'index.html';
  },

  // パスワードリセットメール送信
  async resetPassword(email) {
    const { error } = await _supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html',
    });
    if (error) throw error;
  },

  // ヘッダーの認証状態を更新（全ページ共通）
  async updateHeader() {
    const user = await this.getUser();
    const loginLink = document.getElementById('headerLoginLink');
    const signupLink = document.getElementById('headerSignupLink');
    const mypageLink = document.getElementById('headerMypageLink');
    const logoutBtn = document.getElementById('headerLogoutBtn');

    if (user) {
      // ログイン済み：マイページ + ログアウト表示
      if (loginLink) loginLink.style.display = 'none';
      if (signupLink) signupLink.style.display = 'none';
      if (mypageLink) mypageLink.style.display = '';
      if (logoutBtn) {
        logoutBtn.style.display = '';
        logoutBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.logout();
        });
      }
    } else {
      // 未ログイン：ログイン + 新規登録表示
      if (loginLink) loginLink.style.display = '';
      if (signupLink) signupLink.style.display = '';
      if (mypageLink) mypageLink.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'none';
    }
  },
};

// ページ読み込み時にヘッダーを更新
document.addEventListener('DOMContentLoaded', () => {
  WSP_Auth.updateHeader();
});
