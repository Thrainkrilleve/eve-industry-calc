/**
 * Public site config (safe to commit).
 * OAuth Client IDs are public for PKCE apps — do NOT put client secrets here.
 *
 * Set clientId after creating the app at https://developers.eveonline.com/
 * Callback must be: https://thrainkrilleve.github.io/eve-industry-calc/
 */
window.EVE_INDUSTRY_CONFIG = {
  clientId: '',
  // Optional default scopes (auth.js has its own defaults if omitted)
  scopes: [
    'publicData',
    'esi-markets.structure_markets.v1',
    'esi-universe.read_structures.v1'
  ]
};
