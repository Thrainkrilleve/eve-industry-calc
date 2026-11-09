/**
 * Public site config (safe to commit).
 * OAuth Client IDs are public for PKCE apps — do NOT put client secrets here.
 *
 * Callback (must match Developers Portal exactly):
 * https://thrainkrilleve.github.io/eve-industry-calc/
 */
window.EVE_INDUSTRY_CONFIG = {
  clientId: 'fea926125bda4358ba51084d03a99cd5',
  scopes: [
    'publicData',
    'esi-markets.structure_markets.v1',
    'esi-universe.read_structures.v1'
  ]
};
