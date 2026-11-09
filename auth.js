/**
 * EVE SSO for GitHub Pages / static hosting.
 * Confidential web app (client secret) → Authorization Code + Basic auth.
 * Native app (no secret) → Authorization Code + PKCE.
 * Docs: https://developers.eveonline.com/docs/services/sso/
 */
(function (global) {
  'use strict';

  const AUTH_STORAGE = 'eveIndustryAuth_v1';
  const PKCE_STORAGE = 'eveIndustryPkce_v1';
  const CLIENT_ID_KEY = 'eveIndustryClientId_v1';

  const DEFAULT_SCOPES = [
    'publicData',
    'esi-markets.structure_markets.v1',
    'esi-universe.read_structures.v1'
  ];

  function b64url(buf) {
    const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    let str = '';
    bytes.forEach((b) => { str += String.fromCharCode(b); });
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** CCP SSO examples use urlsafe base64 (padding kept) for Basic auth. */
  function basicAuth(clientId, secret) {
    return 'Basic ' + btoa(clientId + ':' + secret).replace(/\+/g, '-').replace(/\//g, '_');
  }

  function randomString(bytes = 32) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return b64url(arr);
  }

  async function sha256(str) {
    const data = new TextEncoder().encode(str);
    return crypto.subtle.digest('SHA-256', data);
  }

  function redirectUri() {
    // Exact page URL without hash/query — must match the EVE app callback.
    const u = new URL(window.location.href);
    u.hash = '';
    u.search = '';
    let href = u.toString();
    if (href.endsWith('index.html')) href = href.slice(0, -'index.html'.length);
    if (!href.endsWith('/')) href += '/';
    return href;
  }

  function getConfig() {
    return global.EVE_INDUSTRY_CONFIG || {};
  }

  function getClientId() {
    // Production config wins; localStorage only when config has no clientId.
    const fromConfig = (getConfig().clientId || '').trim();
    if (fromConfig) return fromConfig;
    try {
      const override = localStorage.getItem(CLIENT_ID_KEY);
      if (override != null && override.trim()) return override.trim();
    } catch {}
    return '';
  }

  function getClientSecret() {
    try {
      const override = sessionStorage.getItem('eveIndustryClientSecret_v1');
      if (override && override.trim()) return override.trim();
    } catch {}
    return (getConfig().clientSecret || '').trim();
  }

  function setClientId(id) {
    try {
      const v = (id || '').trim();
      if (!v) localStorage.removeItem(CLIENT_ID_KEY);
      else localStorage.setItem(CLIENT_ID_KEY, v);
    } catch {}
  }

  function loadAuth() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function saveAuth(auth) {
    try {
      if (!auth) localStorage.removeItem(AUTH_STORAGE);
      else localStorage.setItem(AUTH_STORAGE, JSON.stringify(auth));
    } catch {}
  }

  function isLoggedIn() {
    const auth = loadAuth();
    return !!(auth && auth.access_token && (!auth.expires_at || Date.now() < auth.expires_at - 30000));
  }

  function accessToken() {
    const auth = loadAuth();
    if (!auth || !auth.access_token) return null;
    if (auth.expires_at && Date.now() >= auth.expires_at - 30000) return null;
    return auth.access_token;
  }

  function character() {
    const auth = loadAuth();
    return auth && auth.character ? auth.character : null;
  }

  async function parseJwtCharacter(accessToken) {
    try {
      const payload = accessToken.split('.')[1];
      const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      const sub = String(json.sub || '');
      const m = sub.match(/CHARACTER:EVE:(\d+)/);
      return {
        id: m ? Number(m[1]) : null,
        name: json.name || json.owner || 'Capsuleer',
        scp: json.scp || []
      };
    } catch {
      return { id: null, name: 'Capsuleer', scp: [] };
    }
  }

  async function beginLogin(scopes = DEFAULT_SCOPES) {
    const clientId = getClientId();
    if (!clientId) throw new Error('Set your EVE SSO Client ID first (Developers Portal).');

    const secret = getClientSecret();
    const state = randomString(16);
    const session = { state, clientId, confidential: !!secret };

    const params = new URLSearchParams({
      response_type: 'code',
      redirect_uri: redirectUri(),
      client_id: clientId,
      scope: scopes.join(' '),
      state
    });

    if (!secret) {
      // Native / public client: PKCE only (no client secret).
      const verifier = randomString(32);
      const challenge = b64url(await sha256(verifier));
      session.verifier = verifier;
      params.set('code_challenge', challenge);
      params.set('code_challenge_method', 'S256');
    }

    sessionStorage.setItem(PKCE_STORAGE, JSON.stringify(session));
    window.location.href = 'https://login.eveonline.com/v2/oauth/authorize?' + params.toString();
  }

  async function handleRedirectCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code) return false;

    const raw = sessionStorage.getItem(PKCE_STORAGE);
    if (!raw) throw new Error('Missing OAuth session — start Login with EVE again.');
    const session = JSON.parse(raw);
    if (state !== session.state) throw new Error('OAuth state mismatch.');

    const secret = getClientSecret();
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code
    });

    if (secret) {
      // Confidential web app — Basic auth only; body is grant_type + code.
      headers.Authorization = basicAuth(session.clientId, secret);
    } else {
      // Native PKCE — client_id + code_verifier in body, no Authorization.
      if (!session.verifier) throw new Error('Missing PKCE verifier — start Login with EVE again.');
      body.set('client_id', session.clientId);
      body.set('code_verifier', session.verifier);
    }

    const res = await fetch('https://login.eveonline.com/v2/oauth/token', {
      method: 'POST',
      headers,
      body
    });
    if (!res.ok) {
      const text = await res.text();
      let hint = '';
      if (res.status === 401) {
        hint = ' — check Client ID/Secret match the Developers Portal app, and callback URL is exact.';
      }
      throw new Error('Token exchange failed (' + res.status + '): ' + text.slice(0, 200) + hint);
    }
    const token = await res.json();
    const character = await parseJwtCharacter(token.access_token);
    const auth = {
      access_token: token.access_token,
      refresh_token: token.refresh_token || null,
      token_type: token.token_type,
      expires_at: Date.now() + (Number(token.expires_in) || 1200) * 1000,
      character,
      client_id: session.clientId
    };
    saveAuth(auth);
    sessionStorage.removeItem(PKCE_STORAGE);

    url.search = '';
    window.history.replaceState({}, document.title, url.toString());
    return true;
  }

  async function refreshIfNeeded() {
    const auth = loadAuth();
    if (!auth) return null;
    if (auth.expires_at && Date.now() < auth.expires_at - 30000) return auth.access_token;
    if (!auth.refresh_token || !auth.client_id) {
      saveAuth(null);
      return null;
    }
    const secret = getClientSecret();
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: auth.refresh_token
    });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (secret) {
      headers.Authorization = basicAuth(auth.client_id, secret);
    } else {
      body.set('client_id', auth.client_id);
    }
    const res = await fetch('https://login.eveonline.com/v2/oauth/token', {
      method: 'POST',
      headers,
      body
    });
    if (!res.ok) {
      saveAuth(null);
      return null;
    }
    const token = await res.json();
    const character = await parseJwtCharacter(token.access_token);
    saveAuth({
      ...auth,
      access_token: token.access_token,
      refresh_token: token.refresh_token || auth.refresh_token,
      expires_at: Date.now() + (Number(token.expires_in) || 1200) * 1000,
      character
    });
    return token.access_token;
  }

  function logout() {
    saveAuth(null);
  }

  global.EveAuth = {
    DEFAULT_SCOPES,
    redirectUri,
    getClientId,
    setClientId,
    loadAuth,
    isLoggedIn,
    accessToken,
    character,
    beginLogin,
    handleRedirectCallback,
    refreshIfNeeded,
    logout
  };
})(window);
