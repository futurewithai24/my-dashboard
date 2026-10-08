// Google認証 + GAS APIクライアント
const GasApi = (() => {
  let _token = null;
  let _exp   = 0;
  let _user  = null;
  let _cb    = null;
  let _googleReady = false;

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
    const loginBtn = document.getElementById('loginBtn');
    const authUser = document.getElementById('authUser');
    if (user) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (authUser) { authUser.textContent = '✓ ' + user.email; authUser.style.display = ''; }
    } else {
      if (loginBtn) loginBtn.style.display = '';
      if (authUser) { authUser.textContent = ''; authUser.style.display = 'none'; }
    }
  }

  // 外部から呼べるログインボタン処理
  function showLogin() {
    if (!_googleReady) {
      alert('Googleサインインの準備中です。数秒後に再度クリックしてください。');
      return;
    }
    // ポップアップウィンドウでサインイン
    google.accounts.id.prompt((notification) => {
      // One Tapがブロックされる場合はリダイレクト方式へ
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        _redirectSignIn();
      }
    });
  }

  function _redirectSignIn() {
    // フォールバック：手動でOAuthフローを開く
    const params = new URLSearchParams({
      client_id:    GAS_CONFIG.CLIENT_ID,
      redirect_uri: location.origin + location.pathname,
      response_type: 'token id_token',
      scope:        'openid email profile',
      nonce:        Math.random().toString(36).slice(2),
    });
    window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params;
  }

  function init(onAuth) {
    _cb = onAuth;

    // ページ遷移後のハッシュにトークンがある場合（フォールバック処理）
    if (location.hash.includes('id_token=')) {
      const hashParams = new URLSearchParams(location.hash.slice(1));
      const idToken = hashParams.get('id_token');
      if (idToken && _setSession(idToken)) {
        history.replaceState(null, '', location.pathname);
        _updateUI(_user);
        onAuth(_user);
        return;
      }
    }

    // sessionStorageからトークン復元
    const tok = sessionStorage.getItem('gsi_tok');
    const exp = parseInt(sessionStorage.getItem('gsi_exp') || '0');
    if (tok && Date.now() / 1000 < exp - 300) {
      if (_setSession(tok)) {
        _updateUI(_user);
        onAuth(_user);
        return;
      }
    }

    // ログインボタンを表示（Google库ロード前でも見える）
    _updateUI(null);

    // Googleライブラリの読み込みを待つ
    const setup = () => {
      if (typeof google === 'undefined' || !google?.accounts?.id) {
        setTimeout(setup, 300);
        return;
      }
      _googleReady = true;
      google.accounts.id.initialize({
        client_id:             GAS_CONFIG.CLIENT_ID,
        callback:              resp => {
          if (_setSession(resp.credential) && _cb) {
            _updateUI(_user);
            _cb(_user);
          }
        },
        auto_select:           true,
        use_fedcm_for_prompt:  false,
        itp_support:           true,
      });

      // One Tapを試みる（失敗してもボタンは常に表示されている）
      google.accounts.id.prompt();
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

  return { init, showLogin, signOut, call, isValid, getUser: () => _user };
})();
