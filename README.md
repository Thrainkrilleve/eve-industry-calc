# EVE Online Industry Calculator

Client-side calculator for **all SDE reactions and manufacturing** (moon goo, composites, ships, modules, etc.).

Built so the core math can later move into an **Alliance Auth** Django app without rewriting the formulas.

## Open

Open `index.html` in a browser (keep `eve-industry-data.js` and `industry-core.js` beside it).

Market prices need network access (Fuzzwork aggregates).

## Features

- Full CCP SDE recipe set (reactions + manufacturing)
- Clickable build tree → **selection board** with editable job quantities
- Shift+click to add a node’s quantity onto an existing selection
- ME / TE + structure presets (Raitaru, Azbel, Sotiyo, Athanor, Tatara, NPC)
- Hub prices (Jita / Amarr / Dodixie / Rens / Hek) via Fuzzwork
- Material cost, output value, and rough profit
- Multibuy copy (`Item<TAB>Qty`) for selection materials or full build

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
| `industry-core.js` | Shared math + market helpers (AA-friendly) |
| `eve-industry-data.js` | Compact SDE recipes/names |
| `build_sde_data.py` | Regenerates data from CCP JSONL |

## Next up

- Make-vs-buy per tree node
- System cost index / SCC / tax
- Invention / T2 decryptors
- GitHub Pages deploy
- Alliance Auth app packaging
