/**
 * Shared chrome + ESI cache for Calculator / Queue / Hangar pages.
 */
(function (global) {
  'use strict';

  const ESI_CACHE_KEY = 'eveIndustryEsiCache_v1';
  const STRUCTURES_KEY = 'eveIndustryStructures_v1';
  const PENDING_BP_KEY = 'eveIndustryPendingBp_v1';
  const ESI_TOKEN_KEY = 'eveIndustryEsiToken_v1';
  const DEV_KEY = 'eveIndustryDev_v1';
  const ASSET_VERSION = '20261108h';

  const ACTIVITY_NAMES = {
    1: 'Manufacturing',
    3: 'TE research',
    4: 'ME research',
    5: 'Copying',
    7: 'Reverse engineer',
    8: 'Invention'
  };

  function safeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function loadEsiCache() {
    return safeGet(ESI_CACHE_KEY, null);
  }
  function saveEsiCache(cache) {
    safeSet(ESI_CACHE_KEY, cache);
  }
  function clearEsiCacheStorage() {
    try { localStorage.removeItem(ESI_CACHE_KEY); } catch {}
  }

  function formatQty(n) {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  function formatIsk(n) {
    if (!Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(2);
  }

  function formatLocal(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  function formatEve(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
      `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} EVE`;
  }

  function formatRemaining(ms) {
    if (!Number.isFinite(ms)) return '—';
    if (ms <= 0) return 'finished';
    const sec = Math.floor(ms / 1000);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  let clockTimer = null;
  function startClocks() {
    const tick = () => {
      const now = new Date();
      const localEl = document.getElementById('localClock');
      const eveEl = document.getElementById('eveClock');
      if (localEl) localEl.innerHTML = `Local <strong>${formatLocal(now)}</strong>`;
      if (eveEl) eveEl.innerHTML = `EVE <strong>${formatEve(now)}</strong>`;
      if (typeof global.EveApp.onClockTick === 'function') global.EveApp.onClockTick(now);
    };
    tick();
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(tick, 1000);
  }

  function markActiveNav() {
    const page = (document.body.dataset.page || '').toLowerCase();
    document.querySelectorAll('.app-nav a[data-nav]').forEach((a) => {
      a.classList.toggle('active', a.dataset.nav === page);
    });
  }

  function getManualToken() {
    const el = document.getElementById('esiTokenInput');
    if (el && el.value.trim()) return el.value.trim();
    return (safeGet(ESI_TOKEN_KEY, '') || '').trim();
  }

  async function ensureEsiToken(characterId) {
    if (global.EveAuth && EveAuth.refreshIfNeeded) {
      const t = await EveAuth.refreshIfNeeded(characterId);
      if (t) return t;
    }
    if (global.EveAuth && EveAuth.accessToken) {
      const t = EveAuth.accessToken(characterId);
      if (t) return t;
    }
    return getManualToken();
  }

  function characterScopes(characterId) {
    const c = global.EveAuth && EveAuth.character && EveAuth.character(characterId);
    const raw = c && c.scp;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String);
    return String(raw).split(/\s+/).filter(Boolean);
  }

  function hasScope(scope, characterId) {
    return characterScopes(characterId).includes(scope);
  }

  function tagOwner(rows, owner) {
    return (rows || []).map((row) => ({
      ...row,
      _ownerId: owner.id,
      _ownerName: owner.name
    }));
  }

  async function syncOneCharacter(account, Core) {
    const token = await ensureEsiToken(account.id);
    if (!token) throw new Error(`Could not refresh token for ${account.name}`);
    const owner = { id: account.id, name: account.name };
    const [bps, assets, jobs] = await Promise.all([
      Core.fetchCharacterBlueprints(account.id, token),
      Core.fetchCharacterAssets(account.id, token),
      Core.fetchCharacterIndustryJobs(account.id, token)
    ]);
    return {
      owner,
      token,
      bps: tagOwner(bps, owner),
      assets: tagOwner(assets, owner),
      jobs: tagOwner(jobs, owner)
    };
  }

  async function rebuildLocations(Core, blueprints, assets, jobs, token) {
    const assetByItemId = new Map();
    for (const a of assets || []) assetByItemId.set(Number(a.item_id), a);
    const counts = new Map();
    function addRef(ref, source) {
      if (!ref || (ref.kind !== 'station' && ref.kind !== 'structure')) return;
      const key = ref.kind + ':' + ref.id;
      if (!counts.has(key)) counts.set(key, { kind: ref.kind, id: ref.id, sources: new Set() });
      counts.get(key).sources.add(source);
    }
    for (const bp of blueprints || []) {
      addRef(Core.resolveLocationRef(bp.location_id, assetByItemId), 'blueprint');
    }
    for (const a of assets || []) {
      if (a.location_type === 'station' || Core.isNpcStationId(a.location_id)) {
        addRef({ kind: 'station', id: Number(a.location_id) }, 'asset');
      } else if (Core.isLikelyStructureId(a.location_id)) {
        addRef({ kind: 'structure', id: Number(a.location_id) }, 'asset');
      }
    }
    for (const job of jobs || []) {
      const fid = Number(job.facility_id);
      if (Core.isNpcStationId(fid)) addRef({ kind: 'station', id: fid }, 'job');
      else if (Core.isLikelyStructureId(fid)) addRef({ kind: 'structure', id: fid }, 'job');
    }
    const refs = [...counts.values()].map((r) => ({ kind: r.kind, id: r.id }));
    const names = await Core.resolveLocationNames(refs, token);
    return [...counts.values()]
      .map((r) => ({
        kind: r.kind,
        id: r.id,
        name: names[r.kind + ':' + r.id] || (r.kind + ' ' + r.id),
        sources: [...r.sources]
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function syncEsi(opts) {
    const Core = global.EveIndustryCore;
    const statusEl = opts && opts.statusEl;
    const scopeSel = document.getElementById('esiSyncScope');
    const scope = (opts && opts.scope) || (scopeSel && scopeSel.value) || 'active';
    const accounts = global.EveAuth && EveAuth.listAccounts ? EveAuth.listAccounts() : [];
    if (!accounts.length) {
      if (statusEl) statusEl.innerHTML = '<span class="status-bad">Log in with EVE first.</span>';
      return null;
    }
    const targets = scope === 'all' ? accounts : accounts.filter((a) => a.active);
    if (!targets.length) {
      if (statusEl) statusEl.innerHTML = '<span class="status-bad">No active character selected.</span>';
      return null;
    }
    if (statusEl) statusEl.textContent = `Syncing ${targets.length} character${targets.length > 1 ? 's' : ''}…`;
    const results = [];
    for (const account of targets) {
      results.push(await syncOneCharacter(account, Core));
    }
    const blueprints = results.flatMap((r) => r.bps);
    const assets = results.flatMap((r) => r.assets);
    const jobs = results.flatMap((r) => r.jobs);
    const assetQty = Core.aggregateAssetsByType(assets);
    const active = results.find((r) => r.owner.id === ((EveAuth.character() || {}).id)) || results[0];
    const locations = await rebuildLocations(Core, blueprints, assets, jobs, active.token);
    const cache = {
      at: Date.now(),
      scope,
      characters: targets.map((t) => ({ id: t.id, name: t.name })),
      blueprints,
      assets,
      jobs,
      locations,
      assetQty
    };
    saveEsiCache(cache);
    if (statusEl) {
      statusEl.innerHTML =
        `<span class="status-ok">Synced</span> ${targets.map((t) => t.name).join(', ')} · ` +
        `${blueprints.length} BP · ${assets.length} assets · ${jobs.length} jobs · ${locations.length} locations`;
    }
    if (typeof opts.onDone === 'function') opts.onDone(cache);
    return cache;
  }

  /**
   * How many full job runs current assets support for a per-run requirements map.
   * reqsPerRun: { itemName: qtyNeededForOneRun }
   */
  function runsPossibleFromAssets(reqsPerRun, assetQty, nameToTypeId) {
    let runs = Infinity;
    let limiter = null;
    const details = [];
    for (const [item, need] of Object.entries(reqsPerRun || {})) {
      const n = Number(need) || 0;
      if (n <= 0) continue;
      const tid = nameToTypeId.get(String(item).toLowerCase());
      const owned = tid != null ? (Number(assetQty[tid]) || 0) : 0;
      const can = Math.floor(owned / n);
      details.push({ item, need: n, owned, can, tid });
      if (can < runs) {
        runs = can;
        limiter = item;
      }
    }
    if (!Number.isFinite(runs)) runs = 0;
    details.sort((a, b) => a.can - b.can || b.need - a.need);
    return { runs, limiter, details };
  }

  function resolveItemLocation(item, assetByItemId, Core) {
    if (item.location_type === 'station' || Core.isNpcStationId(item.location_id)) {
      return { kind: 'station', id: Number(item.location_id) };
    }
    if (Core.isLikelyStructureId(item.location_id)) {
      return { kind: 'structure', id: Number(item.location_id) };
    }
    return Core.resolveLocationRef(item.location_id, assetByItemId);
  }

  function locationKey(ref) {
    if (!ref) return 'other:0';
    return (ref.kind || 'other') + ':' + (ref.id || 0);
  }

  function locationLabel(ref, locations) {
    if (!ref) return 'Unknown';
    const hit = (locations || []).find((l) => l.kind === ref.kind && Number(l.id) === Number(ref.id));
    if (hit) return hit.name;
    if (ref.kind === 'station') return 'Station #' + ref.id;
    if (ref.kind === 'structure') return 'Structure #' + ref.id;
    return 'Other / container #' + (ref.id || '?');
  }

  /** Build character → location → { assets, blueprints } tree. */
  function groupHangar(cache, Core) {
    const blueprints = (cache && cache.blueprints) || [];
    const assets = (cache && cache.assets) || [];
    const locations = (cache && cache.locations) || [];
    const assetByItemId = new Map();
    for (const a of assets) assetByItemId.set(Number(a.item_id), a);

    const byChar = new Map();
    function ensureChar(id, name) {
      const key = String(id || 'unknown');
      if (!byChar.has(key)) {
        byChar.set(key, { id: id || null, name: name || 'Unknown', locations: new Map() });
      }
      return byChar.get(key);
    }
    function ensureLoc(charNode, ref) {
      const key = locationKey(ref);
      if (!charNode.locations.has(key)) {
        charNode.locations.set(key, {
          key,
          ref,
          name: locationLabel(ref, locations),
          assets: [],
          blueprints: []
        });
      }
      return charNode.locations.get(key);
    }

    for (const bp of blueprints) {
      const charNode = ensureChar(bp._ownerId, bp._ownerName);
      const ref = resolveItemLocation(bp, assetByItemId, Core);
      ensureLoc(charNode, ref).blueprints.push(bp);
    }
    for (const asset of assets) {
      const charNode = ensureChar(asset._ownerId, asset._ownerName);
      const ref = resolveItemLocation(asset, assetByItemId, Core);
      ensureLoc(charNode, ref).assets.push(asset);
    }

    return [...byChar.values()]
      .map((c) => ({
        id: c.id,
        name: c.name,
        locations: [...c.locations.values()].sort((a, b) => a.name.localeCompare(b.name))
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function refreshAuthUi(hooks) {
    const status = document.getElementById('authStatus');
    const loginBtn = document.getElementById('eveLoginBtn');
    const addBtn = document.getElementById('eveAddCharBtn');
    const removeBtn = document.getElementById('eveRemoveCharBtn');
    const logoutBtn = document.getElementById('eveLogoutBtn');
    const charSelect = document.getElementById('characterSelect');
    if (!status) return;

    const accounts = global.EveAuth && EveAuth.listAccounts ? EveAuth.listAccounts() : [];
    if (accounts.length) {
      const active = EveAuth.character();
      status.innerHTML =
        `<span class="status-ok">${accounts.length} linked</span> · active: <strong>${active && active.name ? active.name : 'Capsuleer'}</strong>`;
      if (loginBtn) loginBtn.hidden = true;
      if (addBtn) addBtn.hidden = false;
      if (removeBtn) removeBtn.hidden = false;
      if (logoutBtn) logoutBtn.hidden = false;
      if (charSelect) {
        charSelect.hidden = false;
        charSelect.innerHTML = accounts.map((a) =>
          `<option value="${a.id}" ${a.active ? 'selected' : ''}>${a.name}</option>`
        ).join('');
      }
    } else {
      status.textContent = (EveAuth.getClientId && EveAuth.getClientId()) ? 'Not logged in' : 'Login not configured';
      if (loginBtn) loginBtn.hidden = false;
      if (addBtn) addBtn.hidden = true;
      if (removeBtn) removeBtn.hidden = true;
      if (logoutBtn) logoutBtn.hidden = true;
      if (charSelect) {
        charSelect.hidden = true;
        charSelect.innerHTML = '';
      }
    }
    if (hooks && typeof hooks.onAuthChange === 'function') hooks.onAuthChange(accounts);
  }

  async function eveLogin() {
    const clientId = (EveAuth.getClientId && EveAuth.getClientId()) ||
      (global.EVE_INDUSTRY_CONFIG && global.EVE_INDUSTRY_CONFIG.clientId) || '';
    if (!String(clientId).trim()) {
      alert('EVE login is not configured yet. Hard-refresh (Ctrl+F5).');
      return;
    }
    if (EveAuth.setClientId) EveAuth.setClientId(String(clientId).trim());
    await EveAuth.beginLogin();
  }

  function eveLogoutAll() {
    if (EveAuth.listAccounts().length && !confirm('Log out all linked characters on this browser?')) return;
    EveAuth.logoutAll();
    clearEsiCacheStorage();
    refreshAuthUi();
  }

  function eveRemoveActive() {
    const c = EveAuth.character();
    if (!c) return;
    if (!confirm(`Remove ${c.name} from this profile?`)) return;
    EveAuth.removeAccount(c.id);
    clearEsiCacheStorage();
    refreshAuthUi();
  }

  function onCharacterSwitch() {
    const sel = document.getElementById('characterSelect');
    const id = Number(sel && sel.value);
    if (!id) return;
    EveAuth.setActiveCharacter(id);
    refreshAuthUi();
  }

  function wireAuthChrome(hooks) {
    const charSelect = document.getElementById('characterSelect');
    if (charSelect) charSelect.addEventListener('change', () => {
      onCharacterSwitch();
      if (hooks && hooks.onCharacterSwitch) hooks.onCharacterSwitch();
    });
    refreshAuthUi(hooks);
  }

  function setPendingBlueprint(payload) {
    safeSet(PENDING_BP_KEY, payload);
  }
  function consumePendingBlueprint() {
    const v = safeGet(PENDING_BP_KEY, null);
    try { localStorage.removeItem(PENDING_BP_KEY); } catch {}
    return v;
  }

  global.EveApp = {
    ASSET_VERSION,
    ESI_CACHE_KEY,
    STRUCTURES_KEY,
    PENDING_BP_KEY,
    ESI_TOKEN_KEY,
    DEV_KEY,
    ACTIVITY_NAMES,
    safeGet,
    safeSet,
    loadEsiCache,
    saveEsiCache,
    clearEsiCacheStorage,
    formatQty,
    formatIsk,
    formatLocal,
    formatEve,
    formatRemaining,
    startClocks,
    markActiveNav,
    ensureEsiToken,
    syncEsi,
    runsPossibleFromAssets,
    groupHangar,
    refreshAuthUi,
    eveLogin,
    eveLogoutAll,
    eveRemoveActive,
    wireAuthChrome,
    setPendingBlueprint,
    consumePendingBlueprint,
    onClockTick: null
  };

  // Expose common handlers for inline onclick attributes.
  global.eveLogin = eveLogin;
  global.eveLogoutAll = eveLogoutAll;
  global.eveRemoveActive = eveRemoveActive;
})(window);
