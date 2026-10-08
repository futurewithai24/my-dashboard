// Google認証 + GAS APIクライアント
const GasApi = (() => {
  let _token = null;
  let _exp   = 0;
  let _user  = null;
  let _cb    = null;

  function _decode(token) {
    try {
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(b64));
    } catch { return null; }
  }

  function _setSession(token) {
    const p = _decode(token);
    if (!p) return false;
    _token = token;
    _exp   = p.exp;
    _user  = { email: p.email, name: p.name || p.email };
    sessionStorage.setItem('gsi_tok', token);
    sessionStorage.setItem('gsi_exp', String(p.exp));
    return true;
  }

  function _clear() {
    _token = _user = null; _exp = 0;
    sessionStorage.removeItem('gsi_tok');
    sessionStorage.removeItem('gsi_exp');
  }

  function isValid() {
    return !!_token && Date.now() / 1000 < _exp - 300;
  }

  function _updateUI(user) {
    const container = document.getElementById('loginBtnContainer');
    const authUser  = document.getElementById('authUser');
    if (user) {
      if (container) container.style.display = 'none';
      if (authUser)  { authUser.textContent = '✓ ' + user.email; authUser.style.display = ''; }
    } else {
      if (container) container.style.display = '';
      if (authUser)  { authUser.textContent = ''; authUser.style.display = 'none'; }
    }
  }

  function init(onAuth) {
    _cb = onAuth;

    // セッション復元
    const tok = sessionStorage.getItem('gsi_tok');
    const exp = parseInt(sessionStorage.getItem('gsi_exp') || '0');
    if (tok && Date.now() / 1000 < exp - 300) {
      if (_setSession(tok)) { _updateUI(_user); onAuth(_user); return; }
    }
    _updateUI(null);

    // Googleライブラリが読み込まれるまで待つ
    const setup = () => {
      if (typeof google === 'undefined' || !google?.accounts?.id) {
        setTimeout(setup, 300);
        return;
      }

      google.accounts.id.initialize({
        client_id: GAS_CONFIG.CLIENT_ID,
        callback:  (resp) => {
          if (_setSession(resp.credential)) {
            _updateUI(_user);
            if (_cb) _cb(_user);
          }
        },
        // auto_selectは無効化（自動ログインで混乱しないように）
        auto_select: false,
      });

      // 公式ボタンをコンテナに描画（ポップアップ式・ブロックされにくい）
      const container = document.getElementById('loginBtnContainer');
      if (container) {
        google.accounts.id.renderButton(container, {
          type:   'standard',
          shape:  'pill',
          theme:  'filled_blue',
          text:   'signin_with',
          size:   'large',
          locale: 'ja',
          width:  200,
        });
      }
    };
    setup();
  }

  function signOut() {
    _clear();
    if (typeof google !== 'undefined') google.accounts.id.disableAutoSelect();
    _updateUI(null);
    if (_cb) _cb(null);
  }

  async function call(action, data = {}) {
    if (!isValid()) throw new Error('ログインが必要です');
    const res = await fetch(GAS_CONFIG.GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    JSON.stringify({ idToken: _token, action, data }),
    });
    if (!res.ok) throw new Error('通信エラー: ' + res.status);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
  }

  return { init, signOut, call, isValid, getUser: () => _user };
})();
