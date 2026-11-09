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

Put the Client ID in `config.js`:

```js
window.EVE_INDUSTRY_CONFIG = {
  clientId: 'YOUR_CLIENT_ID_HERE',
  scopes: [
    'publicData',
    'esi-markets.structure_markets.v1',
    'esi-universe.read_structures.v1'
  ]
};
```

Commit and push so GitHub Pages picks it up. Client IDs are public for PKCE apps; never commit a client secret.

## 4. Local / temporary override

Open the site with `?dev=1` (or footer **Developer settings**):

- Paste a Client ID override
- Copy callback URL
- Optional manual ESI token for debugging

Overrides stay in browser `localStorage` only.
