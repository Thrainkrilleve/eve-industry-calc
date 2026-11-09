# Developer: create the EVE SSO application

End users only see **Login with EVE**. Client ID / callback / manual tokens live in **Developer settings** (`?dev=1`) or in `config.js`.

## 1. Create the app

1. Open [EVE Developers](https://developers.eveonline.com/)
2. Create a new application (native / PKCE-capable)
3. Set the **Callback URL** exactly (trailing slash):

```text
https://thrainkrilleve.github.io/eve-industry-calc/
```

## 2. Scopes

- `publicData`
- `esi-markets.structure_markets.v1`
- `esi-universe.read_structures.v1`

## 3. Configure production

Put credentials in `config.js`:

```js
window.EVE_INDUSTRY_CONFIG = {
  clientId: 'YOUR_CLIENT_ID_HERE',
  clientSecret: 'YOUR_CLIENT_SECRET_HERE', // required for confidential web apps
  scopes: [
    'publicData',
    'esi-markets.structure_markets.v1',
    'esi-universe.read_structures.v1'
  ]
};
```

**Security note:** a Client Secret in GitHub Pages is world-readable. Use this only briefly, then rotate the secret, or recreate as a **native PKCE** app (no secret) / proxy token exchange through a backend.

## 4. Local / temporary override

Open the site with `?dev=1` (or footer **Developer settings**):

- Paste a Client ID override
- Copy callback URL
- Optional manual ESI token for debugging

Overrides stay in browser `localStorage` only.
