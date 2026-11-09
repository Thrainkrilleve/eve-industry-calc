/**
 * Site config for GitHub Pages.
 *
 * WARNING: clientSecret in a public static site is visible to anyone who
 * views source. Fine for a short public window — rotate the secret afterward,
 * or recreate the app as a native PKCE app (no secret) / move token exchange
 * behind a small backend.
 *
 * Callback (must match Developers Portal exactly):
 * https://thrainkrilleve.github.io/eve-industry-calc/
 */
window.EVE_INDUSTRY_CONFIG = {
  clientId: 'fea926125bda4358ba51084d03a99cd5',
  clientSecret: 'eat_RaNT6LOsWKqwgtKoaGZIbEsXO4xtOHOK_2DcepF',
  scopes: [
    'publicData',
    'esi-markets.structure_markets.v1',
    'esi-universe.read_structures.v1'
  ]
};
