# EVE Online Industry Calculator

Client-side calculator for **all SDE reactions and manufacturing** (moon goo, composites, ships, modules, etc.).

Core math lives in `industry-core.js` so it can later move into an **Alliance Auth** Django app.

## Open

Open `index.html` in a browser (keep `eve-industry-data.js` and `industry-core.js` beside it).

Needs network access for:

- Fuzzwork market aggregates
- ESI adjusted prices + system cost indices (`Load SCI + adjusted prices`)

## Features

- Full CCP SDE recipe set (reactions + manufacturing)
- Clickable build tree → **selection board** with editable job quantities
- **Make vs buy** per intermediate (manual Build/Buy chip, or **Auto make-vs-buy**)
- ME / TE + structure presets (Raitaru, Azbel, Sotiyo, Athanor, Tatara, NPC)
- Hub market prices (Jita / Amarr / Dodixie / Rens / Hek)
- Job install fees: system cost index, structure role bonus, facility tax, SCC surcharge
- Material cost, job fees, output value, profit
- Multibuy copy (`Item<TAB>Qty`)

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
| `industry-core.js` | Shared math + market/ESI helpers |
| `eve-industry-data.js` | Compact SDE recipes/names |
| `build_sde_data.py` | Regenerates data from CCP JSONL |

## Next up

- Invention / T2 decryptors
- GitHub Pages deploy
- Alliance Auth app packaging
