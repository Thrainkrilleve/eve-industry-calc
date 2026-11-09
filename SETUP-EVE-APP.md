# Developer: create the EVE SSO application

End users only see **Login with EVE**. Client ID / callback / manual tokens live in **Developer settings** (`?dev=1`) or in `config.js`.

## 1. Create the app

1. Open [EVE Developers](https://developers.eveonline.com/)
2. Create a **Native** application (PKCE — no client secret)
3. Set the **Callback URL** exactly (trailing slash):

```text
https://thrainkrilleve.github.io/eve-industry-calc/
```

Do **not** use a confidential/web app with a client secret on GitHub Pages. CCP rejects Basic auth for that setup from the browser, and the secret would be public anyway.

## 2. Scopes

- `publicData`
- `esi-markets.structure_markets.v1`
- `esi-universe.read_structures.v1`
- `esi-characters.read_blueprints.v1`
- `esi-assets.read_assets.v1`
- `esi-industry.read_character_jobs.v1`

After changing scopes on the Developers Portal app, users must **log out and log in again** to grant them.

## 3. Configure production

Put the Client ID in `config.js`:

```js
window.EVE_INDUSTRY_CONFIG = {
  clientId: 'YOUR_CLIENT_ID_HERE',
  scopes: [
    'publicData',
    'esi-markets.structure_markets.v1',
    'esi-universe.read_structures.v1',
    'esi-characters.read_blueprints.v1',
    'esi-assets.read_assets.v1',
    'esi-industry.read_character_jobs.v1'
  ]
};
```

## 4. Local / temporary override

Open the site with `?dev=1` (or footer **Developer settings**):

- Paste a Client ID override
- Copy callback URL
- Optional manual ESI token for debugging

Overrides stay in browser `localStorage` only.
