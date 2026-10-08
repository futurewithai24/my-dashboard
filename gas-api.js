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
    // 5分のバッファを持って有効期限チェック
    return !!_token && Date.now() / 1000 < _exp - 300;
  }

  function init(onAuth) {
    _cb = onAuth;

    // sessionStorageからトークン復元
    const tok = sessionStorage.getItem('gsi_tok');
    const exp = parseInt(sessionStorage.getItem('gsi_exp') || '0');
    if (tok && Date.now() / 1000 < exp - 300) {
      if (_setSession(tok)) { onAuth(_user); return; }
    }

    // Googleライブラリの読み込みを待つ
    const setup = () => {
      if (typeof google === 'undefined' || !google?.accounts?.id) {
        setTimeout(setup, 200);
        return;
      }
      google.accounts.id.initialize({
        client_id:   GAS_CONFIG.CLIENT_ID,
        callback:    resp => {
          if (_setSession(resp.credential) && _cb) _cb(_user);
        },
        auto_select: true,
        use_fedcm_for_prompt: false,
      });
      google.accounts.id.prompt((notification) => {
        // One Tapが表示されない場合はボタンを表示
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          const btn = document.getElementById('gsi_button');
          if (btn) {
            btn.style.display = 'block';
            google.accounts.id.renderButton(btn, {
              type: 'standard', shape: 'pill', theme: 'outline',
              text: 'signin_with', size: 'medium', locale: 'ja',
            });
          }
        }
      });
    };
    setup();
  }

  function signOut() {
    _clear();
    if (typeof google !== 'undefined') google.accounts.id.disableAutoSelect();
    if (_cb) _cb(null);
  }

  async function call(action, data = {}) {
    if (!isValid()) throw new Error('ログインが必要です');
    const res = await fetch(GAS_CONFIG.GAS_URL, {
      method:  'POST',
      // text/plain にすることでCORSプリフライトを回避（GASの制限）
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
