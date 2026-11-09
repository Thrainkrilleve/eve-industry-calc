# Create the EVE SSO application

This calculator uses **Authorization Code + PKCE** (no client secret needed at runtime).

## 1. Create the app

1. Open [EVE Developers](https://developers.eveonline.com/)
2. Create a new application (native / PKCE-capable)
3. Set the **Callback URL** exactly to your GitHub Pages URL, including trailing slash:

```text
https://thrainkrilleve.github.io/eve-industry-calc/
```

For local file testing, PKCE callbacks usually need `http://localhost/...` served over a tiny static server (browsers block `file://` OAuth). Prefer the GitHub Pages URL once Pages is live.

## 2. Scopes

Request at least:

- `publicData`
- `esi-markets.structure_markets.v1`
- `esi-universe.read_structures.v1`

## 3. Configure the calculator

1. Open the site
2. Paste the **Client ID** into **Alliance / Player Structure Markets → EVE SSO Client ID**
3. Click **Save Client ID**
4. Click **Login with EVE**

The page shows the callback URL it will use — that string must match the Developers Portal entry character-for-character.

## 4. Structure markets

After login, add structure IDs you can dock at, select the structure as market hub, and **Refresh market prices**.
