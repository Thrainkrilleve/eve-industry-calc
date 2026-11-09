# EVE Online Industry Calculator

Client-side calculator for **all SDE reactions and manufacturing**, plus **invention / T2** planning.

Core math lives in `industry-core.js` so it can later move into an **Alliance Auth** Django app.

## Open

Open `index.html` in a browser (keep `eve-industry-data.js` and `industry-core.js` beside it).

Needs network access for:

- Fuzzwork region market aggregates
- ESI adjusted prices + system cost indices
- ESI structure markets (optional — requires your access token)

## Features

- Full CCP SDE recipe set (reactions + manufacturing)
- **Invention / T2**: outcomes, decryptors, skill levels, expected jobs/cost, invented ME/TE/runs
- Clickable build tree → **selection board** with editable job quantities
- **Make vs buy** per intermediate (manual or auto)
- ME / TE + structure presets
- Region hubs (Jita / Amarr / Dodixie / Rens / Hek)
- **Player-owned structure markets** via ESI token (`esi-markets.structure_markets.v1`)
- Job install fees: SCI, role bonus, facility tax, SCC
- Multibuy copy (`Item<TAB>Qty`)

## Structure markets (alliances)

1. Paste an ESI **access token** for a character that can dock at the citadel  
   Scope needed: `esi-markets.structure_markets.v1`  
   Optional for name lookup: `esi-universe.read_structures.v1`
2. Add Structure ID + display name
3. Select that structure as **Market hub**
4. Click **Refresh market prices**

Token is stored only in this browser’s `localStorage`. When this becomes an Alliance Auth app, SSO can replace the paste box.

## Rebuild data from CCP SDE

```powershell
Invoke-WebRequest -Uri "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip" -OutFile "sde\sde-latest-jsonl.zip"
Expand-Archive -Path "sde\sde-latest-jsonl.zip" -DestinationPath "sde\extracted" -Force
python build_sde_data.py
```

## Layout

| File | Role |
|------|------|
| `index.html` | UI |
| `industry-core.js` | Shared math + market/ESI/invention helpers |
| `eve-industry-data.js` | Compact SDE recipes, inventions, decryptors |
| `build_sde_data.py` | Regenerates data from CCP JSONL |

## Next up (parked)

- GitHub Pages deploy
- Alliance Auth app packaging (SSO for structure markets)
