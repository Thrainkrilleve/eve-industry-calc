/**
 * Site config for GitHub Pages.
 *
 * Use a Native (PKCE) application — Client ID only, no secret.
 * Callback (must match Developers Portal exactly):
 * https://thrainkrilleve.github.io/eve-industry-calc/
 *
 * If you previously pasted a Client Secret here: remove/rotate it in the
 * portal. Secrets cannot authenticate this static site (CCP rejects Basic
 * auth for public clients), and they are world-readable on GitHub Pages.
 */
window.EVE_INDUSTRY_CONFIG = {
  clientId: 'fea926125bda4358ba51084d03a99cd5',
  scopes: [
    'publicData',
    'esi-markets.structure_markets.v1',
    'esi-universe.read_structures.v1',
    'esi-characters.read_blueprints.v1',
    'esi-assets.read_assets.v1',
    'esi-industry.read_character_jobs.v1'
  ]
};
