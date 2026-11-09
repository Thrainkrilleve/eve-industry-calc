# EVE Online Industry Calculator

Client-side calculator for **all SDE reactions and manufacturing** (moon goo, composites, ships, modules, etc.).

## Open

Open `index.html` in a browser (keep `eve-industry-data.js` beside it).

## Rebuild data from CCP SDE

```powershell
# Re-download latest SDE if needed
Invoke-WebRequest -Uri "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip" -OutFile "sde\sde-latest-jsonl.zip"
Expand-Archive -Path "sde\sde-latest-jsonl.zip" -DestinationPath "sde\extracted" -Force
python build_sde_data.py
```

`build_sde_data.py` reads `blueprints.jsonl` + `types.jsonl` (+ groups/categories) and writes `eve-industry-data.js`.

## Corrections included via SDE

- Ceramic Powder → Silicates + Evaporite Deposits + Hydrogen Fuel Blocks
- Carbon Polymers → Hydrocarbons + Silicates + Helium Fuel Blocks
- Crystallite Alloy → Cobalt + Cadmium + Helium Fuel Blocks
- Titanium Chromide → Titanium + Chromium + Oxygen Fuel Blocks
