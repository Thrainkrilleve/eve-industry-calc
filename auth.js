/**
 * EVE SSO — Authorization Code + PKCE (native / public client).
 * Supports multiple characters linked in one browser profile.
 * Docs: https://developers.eveonline.com/docs/services/sso/
 */
(function (global) {
  'use strict';

  const AUTH_STORAGE = 'eveIndustryAuth_v2';
  const AUTH_STORAGE_LEGACY = 'eveIndustryAuth_v1';
  const PKCE_STORAGE = 'eveIndustryPkce_v1';
  const CLIENT_ID_KEY = 'eveIndustryClientId_v1';

  const DEFAULT_SCOPES = [
    'publicData',
    'esi-markets.structure_markets.v1',
    'esi-universe.read_structures.v1',
    'esi-characters.read_blueprints.v1',
    'esi-assets.read_assets.v1',
    'esi-industry.read_character_jobs.v1'
  ];

  function b64url(buf) {
    const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    let str = '';
    bytes.forEach((b) => { str += String.fromCharCode(b); });
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
    const fromConfig = (getConfig().clientId || '').trim();
    if (fromConfig) return fromConfig;
    try {
      const override = localStorage.getItem(CLIENT_ID_KEY);
      if (override != null && override.trim()) return override.trim();
    } catch {}
    return '';
  }

  function setClientId(id) {
    try {
      const v = (id || '').trim();
      if (!v) localStorage.removeItem(CLIENT_ID_KEY);
      else localStorage.setItem(CLIENT_ID_KEY, v);
    } catch {}
  }

  function emptyStore() {
    return { activeId: null, accounts: {} };
  }

  function migrateLegacy(raw) {
    if (!raw || typeof raw !== 'object') return emptyStore();
    if (raw.accounts && typeof raw.accounts === 'object') {
      return {
        activeId: raw.activeId != null ? Number(raw.activeId) : null,
        accounts: raw.accounts
      };
    }
    // Legacy single-session shape.
    if (raw.access_token && raw.character && raw.character.id) {
      const id = Number(raw.character.id);
      return { activeId: id, accounts: { [id]: raw } };
    }
    return emptyStore();
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE);
      if (raw) return migrateLegacy(JSON.parse(raw));
      const legacy = localStorage.getItem(AUTH_STORAGE_LEGACY);
      if (legacy) {
        const migrated = migrateLegacy(JSON.parse(legacy));
        saveStore(migrated);
        try { localStorage.removeItem(AUTH_STORAGE_LEGACY); } catch {}
        return migrated;
      }
    } catch {}
    return emptyStore();
  }

  function saveStore(store) {
    try {
      if (!store || !store.accounts || !Object.keys(store.accounts).length) {
        localStorage.removeItem(AUTH_STORAGE);
        return;
      }
      localStorage.setItem(AUTH_STORAGE, JSON.stringify(store));
    } catch {}
  }

  function upsertAccount(session) {
    const id = session && session.character && Number(session.character.id);
    if (!id) throw new Error('Login succeeded but character id was missing.');
    const store = loadStore();
    store.accounts[id] = session;
    store.activeId = id;
    saveStore(store);
    return session;
  }

  function removeAccount(characterId) {
    const store = loadStore();
    const id = Number(characterId);
    delete store.accounts[id];
    if (Number(store.activeId) === id) {
      const remaining = Object.keys(store.accounts).map(Number);
      store.activeId = remaining.length ? remaining[0] : null;
    }
    saveStore(store);
    return store.activeId;
  }

  function setActiveCharacter(characterId) {
    const store = loadStore();
    const id = Number(characterId);
    if (!store.accounts[id]) throw new Error('Character is not linked in this profile.');
    store.activeId = id;
    saveStore(store);
    return store.accounts[id];
  }

  function listAccounts() {
    const store = loadStore();
    return Object.values(store.accounts)
      .map((a) => ({
        id: a.character && a.character.id,
        name: (a.character && a.character.name) || 'Capsuleer',
        expires_at: a.expires_at || null,
        scp: (a.character && a.character.scp) || [],
        active: Number(a.character && a.character.id) === Number(store.activeId)
      }))
      .filter((a) => a.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Active session (legacy-compatible). */
  function loadAuth() {
    const store = loadStore();
    if (!store.activeId) return null;
    return store.accounts[store.activeId] || null;
  }

  function saveAuth(auth) {
    // Legacy helper: null clears active account only if wiping; prefer removeAccount/logout.
    if (!auth) {
      const store = loadStore();
      if (store.activeId) removeAccount(store.activeId);
      return;
    }
    upsertAccount(auth);
  }

  function isLoggedIn() {
    return listAccounts().length > 0;
  }

  function accessToken(characterId) {
    const store = loadStore();
    const id = characterId != null ? Number(characterId) : Number(store.activeId);
    const auth = store.accounts[id];
    if (!auth || !auth.access_token) return null;
    if (auth.expires_at && Date.now() >= auth.expires_at - 30000) return null;
    return auth.access_token;
  }

  function character(characterId) {
    const store = loadStore();
    const id = characterId != null ? Number(characterId) : Number(store.activeId);
    const auth = store.accounts[id];
    return auth && auth.character ? auth.character : null;
  }

  async function parseJwtCharacter(accessTokenValue) {
    try {
      const payload = accessTokenValue.split('.')[1];
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
    if (!clientId) throw new Error('Set your EVE SSO Client ID first (Developers Portal → native app).');

    const verifier = randomString(32);
    const challenge = b64url(await sha256(verifier));
    const state = randomString(16);
    sessionStorage.setItem(PKCE_STORAGE, JSON.stringify({ verifier, state, clientId }));

    const params = new URLSearchParams({
      response_type: 'code',
      redirect_uri: redirectUri(),
      client_id: clientId,
      scope: scopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });
    window.location.href = 'https://login.eveonline.com/v2/oauth/authorize?' + params.toString();
  }

  async function handleRedirectCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code) return false;

    const raw = sessionStorage.getItem(PKCE_STORAGE);
    if (!raw) throw new Error('Missing PKCE session — start Login with EVE again.');
    const pkce = JSON.parse(raw);
    if (state !== pkce.state) throw new Error('OAuth state mismatch.');
    if (!pkce.verifier) throw new Error('Missing PKCE verifier — start Login with EVE again.');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: pkce.clientId,
      code_verifier: pkce.verifier
    });

    const res = await fetch('https://login.eveonline.com/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error('Token exchange failed (' + res.status + '): ' + text.slice(0, 240));
    }
    const token = await res.json();
    const characterInfo = await parseJwtCharacter(token.access_token);
    upsertAccount({
      access_token: token.access_token,
      refresh_token: token.refresh_token || null,
      token_type: token.token_type,
      expires_at: Date.now() + (Number(token.expires_in) || 1200) * 1000,
      character: characterInfo,
      client_id: pkce.clientId
    });
    sessionStorage.removeItem(PKCE_STORAGE);

    url.search = '';
    window.history.replaceState({}, document.title, url.toString());
    return true;
  }

  async function refreshAccount(characterId) {
    const store = loadStore();
    const id = Number(characterId);
    const auth = store.accounts[id];
    if (!auth) return null;
    if (auth.expires_at && Date.now() < auth.expires_at - 30000) return auth.access_token;
    if (!auth.refresh_token || !auth.client_id) {
      removeAccount(id);
      return null;
    }
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: auth.refresh_token,
      client_id: auth.client_id
    });
    const res = await fetch('https://login.eveonline.com/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!res.ok) {
      removeAccount(id);
      return null;
    }
    const token = await res.json();
    const characterInfo = await parseJwtCharacter(token.access_token);
    store.accounts[id] = {
      ...auth,
      access_token: token.access_token,
      refresh_token: token.refresh_token || auth.refresh_token,
      expires_at: Date.now() + (Number(token.expires_in) || 1200) * 1000,
      character: characterInfo
    };
    saveStore(store);
    return token.access_token;
  }

  async function refreshIfNeeded(characterId) {
    const store = loadStore();
    const id = characterId != null ? Number(characterId) : Number(store.activeId);
    if (!id) return null;
    return refreshAccount(id);
  }

  async function refreshAllIfNeeded() {
    const store = loadStore();
    const tokens = {};
    for (const id of Object.keys(store.accounts)) {
      tokens[id] = await refreshAccount(id);
    }
    return tokens;
  }

  /** Remove active character (or all if only one). */
  function logout() {
    const store = loadStore();
    if (store.activeId) removeAccount(store.activeId);
  }

  function logoutAll() {
    saveStore(emptyStore());
  }

  global.EveAuth = {
    DEFAULT_SCOPES,
    redirectUri,
    getClientId,
    setClientId,
    loadAuth,
    saveAuth,
    loadStore,
    listAccounts,
    setActiveCharacter,
    removeAccount,
    isLoggedIn,
    accessToken,
    character,
    beginLogin,
    handleRedirectCallback,
    refreshIfNeeded,
    refreshAllIfNeeded,
    logout,
    logoutAll
  };
})(window);
